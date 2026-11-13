import { endOfDay } from "date-fns";
import { ok, route } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, Account, Invoice, Reminder, type ILead, type IInvoice, type IAccount, type IReminder } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope, accountScope, reminderScope } from "@/lib/rbac";
import { ownerNameMap } from "@/lib/services";
import { agingDate, buildOutstandingAging, collections, isOutstanding, isOverdue, rankDebtors } from "@/lib/receivables";
import { PIPELINE_STAGES, type LeadStage } from "@/lib/constants";
import type { DashboardData, PipelineStageSummary, StageLeadRef, WorkItem, UpcomingReminder } from "@/lib/types";

const DAY = 86400000;
/** The working funnel: everything before won (parked and lost are off it). */
const OPEN_STAGES: LeadStage[] = PIPELINE_STAGES.filter((s) => s !== "won");
/** A qualified or proposal lead untouched for longer than this needs a follow-up. */
const FOLLOW_UP_AFTER = 2 * DAY;
const UPCOMING_DAYS = 7;
const TOP_DEBTORS = 5;
/** Reminders still waiting on the user (delivered or not, but not done or canceled). */
const OPEN_REMINDER_STATUSES: IReminder["status"][] = ["scheduled", "sent", "failed"];

type LeadRow = Pick<ILead, "_id" | "ownerId" | "name" | "company" | "stage" | "estValue" | "lastActivityAt" | "convertedAccountId">;
type AccountRow = Pick<IAccount, "_id" | "ownerId" | "name" | "status" | "lastActivityAt">;
type InvoiceRow = Pick<IInvoice, "_id" | "accountId" | "number" | "amount" | "status" | "issuedAt" | "dueAt" | "paidAt">;
type ReminderRow = Pick<IReminder, "_id" | "title" | "dueAt" | "leadId" | "accountId" | "entityLabel" | "createdAt">;

const iso = (d: Date) => new Date(d).toISOString();

function leadRef(l: LeadRow | undefined): StageLeadRef | null {
  return l ? { id: String(l._id), name: l.name, company: l.company ?? "", lastActivityAt: iso(l.lastActivityAt) } : null;
}

// GET /api/dashboard — everything the Today page shows, RBAC-scoped, in one pass.
export const GET = route(async () => {
  const user = await requireUser();
  await connectDB();

  const now = new Date();
  const todayEnd = endOfDay(now);
  const weekEnd = new Date(todayEnd.getTime() + UPCOMING_DAYS * DAY);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Visible accounts (for money + RBAC join on invoices).
  const accounts = await Account.find(accountScope(user)).select("ownerId name status lastActivityAt").lean<AccountRow[]>();
  const accountById = new Map(accounts.map((a) => [String(a._id), a]));

  const [leads, invoices, reminders] = await Promise.all([
    Lead.find(leadScope(user)).select("ownerId name company stage estValue lastActivityAt convertedAccountId").lean<LeadRow[]>(),
    Invoice.find({ accountId: { $in: accounts.map((a) => a._id) }, deletedAt: null })
      .select("accountId number amount status issuedAt dueAt paidAt")
      .lean<InvoiceRow[]>(),
    Reminder.find({ ...reminderScope(user), status: { $in: OPEN_REMINDER_STATUSES } })
      .select("title dueAt leadId accountId entityLabel createdAt")
      .sort({ dueAt: 1 })
      .lean<ReminderRow[]>(),
  ]);
  const leadById = new Map(leads.map((l) => [String(l._id), l]));

  // Headline counts — "open" is the working funnel (excludes won, parked holding, and lost).
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage));
  const won = leads.filter((l) => l.stage === "won");
  const wonThisMonth = won.filter((l) => new Date(l.lastActivityAt) >= monthStart).length;

  // Pipeline by stage, with the longest-untouched and most recent lead in each.
  const pipeline: PipelineStageSummary[] = PIPELINE_STAGES.map((stage) => {
    const items = leads
      .filter((l) => l.stage === stage)
      .sort((a, b) => new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime());
    return {
      stage,
      count: items.length,
      value: items.reduce((s, l) => s + (l.estValue ?? 0), 0),
      oldest: leadRef(items[0]),
      latest: leadRef(items[items.length - 1]),
    };
  });

  // Work queue: due reminders, stale follow-ups (unless a reminder already covers the lead), overdue invoices.
  const remindedLeads = new Set(reminders.filter((r) => r.leadId).map((r) => String(r.leadId)));
  const staleLeads = leads.filter(
    (l) =>
      (l.stage === "qualified" || l.stage === "proposal") &&
      !remindedLeads.has(String(l._id)) &&
      now.getTime() - new Date(l.lastActivityAt).getTime() > FOLLOW_UP_AFTER,
  );
  const receivable = invoices.map((i) => ({
    ...i,
    id: String(i._id),
    accountId: String(i.accountId),
    accountName: accountById.get(String(i.accountId))!.name,
  }));
  const overdue = receivable.filter((i) => isOverdue(i, now));

  const owners = await ownerNameMap([
    ...staleLeads.map((l) => l.ownerId),
    ...overdue.map((i) => accountById.get(i.accountId)!.ownerId),
  ]);

  const blank = { stage: null, value: 0, dueAt: null, leadId: null, reminderId: null, invoiceId: null, invoiceNumber: null };
  const sortable: { at: Date; item: WorkItem }[] = [
    ...staleLeads.map((l) => ({
      at: new Date(l.lastActivityAt),
      item: {
        ...blank,
        id: `lead-${l._id}`,
        kind: "followup" as const,
        title: `Call back ${l.name}`,
        name: l.name,
        company: l.company ?? "",
        href: `/leads/${l._id}`,
        stage: l.stage,
        value: l.estValue ?? 0,
        lastTouchedAt: iso(l.lastActivityAt),
        ownerName: owners.get(String(l.ownerId)) ?? "",
        leadId: String(l._id),
      },
    })),
    ...reminders
      .filter((r) => new Date(r.dueAt) <= todayEnd)
      .map((r) => {
        const lead = r.leadId ? leadById.get(String(r.leadId)) : undefined;
        const account = r.accountId ? accountById.get(String(r.accountId)) : undefined;
        return {
          at: new Date(r.dueAt),
          item: {
            ...blank,
            id: `reminder-${r._id}`,
            kind: "reminder" as const,
            title: r.title,
            name: lead?.name ?? account?.name ?? r.entityLabel ?? "",
            company: lead?.company ?? "",
            href: lead ? `/leads/${lead._id}` : account ? `/accounts/${account._id}` : null,
            stage: lead?.stage ?? null,
            value: lead?.estValue ?? 0,
            dueAt: iso(r.dueAt),
            lastTouchedAt: iso(lead?.lastActivityAt ?? account?.lastActivityAt ?? r.createdAt),
            ownerName: user.name,
            leadId: lead ? String(lead._id) : null,
            reminderId: String(r._id),
          },
        };
      }),
    ...overdue.map((i) => {
      const account = accountById.get(i.accountId)!;
      return {
        at: agingDate(i),
        item: {
          ...blank,
          id: `inv-${i.id}`,
          kind: "invoice" as const,
          title: `Chase payment from ${account.name}`,
          name: account.name,
          company: "",
          href: `/accounts/${i.accountId}?tab=invoices`,
          value: i.amount,
          dueAt: iso(agingDate(i)),
          lastTouchedAt: iso(account.lastActivityAt),
          ownerName: owners.get(String(account.ownerId)) ?? "",
          invoiceId: i.id,
          invoiceNumber: i.number,
        },
      };
    }),
  ];
  const queue = sortable.sort((a, b) => a.at.getTime() - b.at.getTime()).map((s) => s.item);

  const upcoming: UpcomingReminder[] = reminders
    .filter((r) => new Date(r.dueAt) > todayEnd && new Date(r.dueAt) <= weekEnd)
    .map((r) => ({
      id: String(r._id),
      title: r.title,
      dueAt: iso(r.dueAt),
      entityLabel: r.entityLabel ?? "",
      href: r.leadId && leadById.has(String(r.leadId)) ? `/leads/${r.leadId}` : r.accountId && accountById.has(String(r.accountId)) ? `/accounts/${r.accountId}` : null,
    }));

  // Receivables.
  const billedRows = receivable.filter((i) => i.status !== "draft");
  const debtors = rankDebtors(receivable);
  const collected = collections(receivable, now);
  const latestPayment = collected.payments[0];

  const data: DashboardData = {
    asOf: now.toISOString(),
    openLeads: open.length,
    openValue: open.reduce((s, l) => s + (l.estValue ?? 0), 0),
    qualified: leads.filter((l) => l.stage === "qualified").length,
    wonThisMonth,
    wonConverted: won.filter((l) => l.convertedAccountId).length,
    activeAccounts: accounts.filter((a) => a.status === "active").length,
    pipeline,
    queue,
    receivables: {
      billed: billedRows.reduce((s, i) => s + i.amount, 0),
      outstanding: receivable.filter(isOutstanding).reduce((s, i) => s + i.amount, 0),
      aging: buildOutstandingAging(receivable, now),
      owingAccounts: debtors.length,
      debtors: debtors.slice(0, TOP_DEBTORS).map((d) => ({ ...d, name: accountById.get(d.accountId)!.name })),
      collected: {
        thisMonth: collected.thisMonth,
        lastMonth: collected.lastMonth,
        payments: collected.payments.length,
        latest: latestPayment
          ? { accountId: latestPayment.accountId, accountName: latestPayment.accountName, number: latestPayment.number }
          : null,
      },
    },
    upcoming,
  };
  return ok(data);
});
