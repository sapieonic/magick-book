import { ok, route } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, Account, Invoice, type ILead, type IInvoice, type IAccount } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope, accountScope } from "@/lib/rbac";
import { PIPELINE_STAGES } from "@/lib/constants";
import type { DashboardData, AttentionItem } from "@/lib/types";

const DAY = 86400000;

export const GET = route(async () => {
  const user = await requireUser();
  await connectDB();

  const lScope = leadScope(user);
  const aScope = accountScope(user);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Visible accounts (for money + RBAC join on invoices).
  const accounts = await Account.find(aScope).select("name status").lean<Pick<IAccount, "_id" | "name" | "status">[]>();
  const accIds = accounts.map((a) => a._id);
  const accNameMap = new Map(accounts.map((a) => [String(a._id), a.name]));

  const [leads, invoices] = await Promise.all([
    Lead.find(lScope).select("name company stage estValue lastActivityAt").lean<ILead[]>(),
    Invoice.find({ accountId: { $in: accIds } }).lean<IInvoice[]>(),
  ]);

  // KPIs
  const openLeads = leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length;
  const qualified = leads.filter((l) => l.stage === "qualified").length;
  const wonThisMonth = leads.filter((l) => l.stage === "won" && new Date(l.lastActivityAt) >= monthStart).length;
  const activeAccounts = accounts.filter((a) => a.status === "active").length;

  // Pipeline funnel
  const pipeline = PIPELINE_STAGES.map((stage) => {
    const items = leads.filter((l) => l.stage === stage);
    return { stage, count: items.length, value: items.reduce((s, l) => s + (l.estValue ?? 0), 0) };
  });

  // Revenue this month vs last (billed invoices issued in the period)
  const billable = invoices.filter((i) => i.status !== "draft");
  const revenueThisMonth = billable.filter((i) => new Date(i.issuedAt) >= monthStart).reduce((s, i) => s + i.amount, 0);
  const revenuePrevMonth = billable
    .filter((i) => new Date(i.issuedAt) >= prevMonthStart && new Date(i.issuedAt) < monthStart)
    .reduce((s, i) => s + i.amount, 0);
  const revenueDeltaPct = revenuePrevMonth > 0 ? Math.round(((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100) : 0;

  // Needs attention today
  const attention: AttentionItem[] = [];
  for (const inv of invoices.filter((i) => i.status === "overdue").slice(0, 4)) {
    const days = inv.dueAt ? Math.max(1, Math.round((now.getTime() - new Date(inv.dueAt).getTime()) / DAY)) : 0;
    attention.push({
      id: `inv-${inv._id}`,
      kind: "invoice_overdue",
      title: `Invoice #${inv.number} for ${accNameMap.get(String(inv.accountId)) ?? "account"} is overdue ${days} days`,
      tag: "Overdue",
      tagTone: "danger",
      action: "Remind",
      href: `/accounts/${inv.accountId}?tab=invoices`,
    });
  }
  for (const l of leads
    .filter((l) => (l.stage === "qualified" || l.stage === "proposal") && now.getTime() - new Date(l.lastActivityAt).getTime() > 2 * DAY)
    .slice(0, 4)) {
    attention.push({
      id: `lead-${l._id}`,
      kind: "lead_followup",
      title: `Call back ${l.name}${l.company ? ` · ${l.company}` : ""} — follow-up due`,
      tag: l.stage === "qualified" ? "Qualified" : "Proposal",
      tagTone: "warn",
      action: "Call",
      href: `/leads/${l._id}`,
    });
  }

  const data: DashboardData = {
    openLeads,
    qualified,
    wonThisMonth,
    activeAccounts,
    pipeline,
    revenueThisMonth,
    revenueDeltaPct,
    attention: attention.slice(0, 6),
  };
  return ok(data);
});
