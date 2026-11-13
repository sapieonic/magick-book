import "server-only";
import { Types } from "mongoose";
import { Activity, AuditLog, Invoice, Expense, User, type IUser } from "./models";
import type { ActivityKind, AuditAction, AuditEntity } from "./constants";
import type { AccountFinance, AccountListFinance, AuditChange } from "./types";
import { LEAD_STAGES, type LeadStage } from "./constants";
import type { ILead, IAuditLog } from "./models";
import type { LeadStageSpan } from "./types";

/** Append an activity/timeline entry. */
export async function logActivity(opts: {
  workspaceId: Types.ObjectId;
  kind: ActivityKind;
  title: string;
  detail?: string;
  actorId?: Types.ObjectId;
  leadId?: Types.ObjectId;
  accountId?: Types.ObjectId;
}): Promise<void> {
  await Activity.create(opts);
}

/**
 * Write an audit-trail entry. Records WHO did WHAT to WHICH record, with an
 * optional field-level diff. `entityLabel` and `actor.name` are denormalized so
 * the entry stays readable even after the record itself is archived/removed.
 */
export async function audit(opts: {
  entity: AuditEntity;
  entityId: Types.ObjectId | string;
  entityLabel: string;
  action: AuditAction;
  actor: Pick<IUser, "_id" | "name" | "workspaceId">;
  changes?: AuditChange[];
  leadId?: Types.ObjectId | string;
  accountId?: Types.ObjectId | string;
}): Promise<void> {
  // No-op an "update" with an empty diff so we don't clutter the trail.
  if (opts.action === "update" && (!opts.changes || opts.changes.length === 0)) return;
  await AuditLog.create({
    workspaceId: opts.actor.workspaceId,
    entity: opts.entity,
    entityId: opts.entityId,
    entityLabel: opts.entityLabel,
    action: opts.action,
    actorId: opts.actor._id,
    actorName: opts.actor.name,
    changes: opts.changes ?? [],
    leadId: opts.leadId,
    accountId: opts.accountId,
  });
}

/**
 * Field-level diff for an audit "update". Compares `patch` against the
 * `before` snapshot and returns only the keys whose value actually changed.
 * Dates and arrays are normalized so cosmetic differences don't register.
 */
export function diffChanges(before: Record<string, unknown>, patch: Record<string, unknown>, fields: string[]): AuditChange[] {
  const norm = (v: unknown): unknown => {
    if (v === undefined || v === null) return null;
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(String).join(", ");
    return v;
  };
  const changes: AuditChange[] = [];
  for (const f of fields) {
    if (!(f in patch)) continue;
    const from = norm(before[f]);
    const to = norm(patch[f]);
    if (from !== to) changes.push({ field: f, from, to });
  }
  return changes;
}

/** Resolve a set of user ids to display names in one query. */
export async function ownerNameMap(ids: (Types.ObjectId | string)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(String))].filter(Boolean);
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } })
    .select("name")
    .lean<{ _id: Types.ObjectId; name: string }[]>();
  return new Map(users.map((u) => [String(u._id), u.name]));
}

/** Roll up an account's money: billed / paid / outstanding / expenses / margin. */
export async function accountFinance(accountId: Types.ObjectId | string): Promise<AccountFinance> {
  const accId = new Types.ObjectId(accountId);
  const [invoiceAgg, expenseAgg] = await Promise.all([
    Invoice.aggregate<{ _id: string; total: number }>([
      { $match: { accountId: accId, deletedAt: null } },
      { $group: { _id: "$status", total: { $sum: "$amount" } } },
    ]),
    Expense.aggregate<{ _id: null; total: number }>([
      { $match: { accountId: accId, deletedAt: null } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  return financeFromTotals(new Map(invoiceAgg.map((r) => [r._id, r.total])), expenseAgg[0]?.total ?? 0);
}

/** Shared rollup rule: billed = sent + paid + overdue (drafts excluded), outstanding = sent + overdue. */
function financeFromTotals(byStatus: Map<string, number>, expenses: number): AccountFinance {
  const billed = (byStatus.get("sent") ?? 0) + (byStatus.get("paid") ?? 0) + (byStatus.get("overdue") ?? 0);
  const paid = byStatus.get("paid") ?? 0;
  const outstanding = (byStatus.get("sent") ?? 0) + (byStatus.get("overdue") ?? 0);
  const margin = billed > 0 ? Math.max(0, (billed - expenses) / billed) : 0;
  return { billed, paid, outstanding, expenses, margin };
}

/**
 * `accountFinance` for many accounts at once (list views): one invoice
 * aggregation grouped by account + status and one expense aggregation, keyed by
 * account id. Accounts with no money rows are absent from the map.
 */
export async function accountFinances(accountIds: Types.ObjectId[]): Promise<Map<string, AccountListFinance>> {
  if (!accountIds.length) return new Map();
  const match = { accountId: { $in: accountIds }, deletedAt: null };
  const [invoiceAgg, expenseAgg] = await Promise.all([
    Invoice.aggregate<{ _id: { accountId: Types.ObjectId; status: string }; total: number }>([
      { $match: match },
      { $group: { _id: { accountId: "$accountId", status: "$status" }, total: { $sum: "$amount" } } },
    ]),
    Expense.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: match },
      { $group: { _id: "$accountId", total: { $sum: "$amount" } } },
    ]),
  ]);

  const statusTotals = new Map<string, Map<string, number>>();
  for (const r of invoiceAgg) {
    const key = String(r._id.accountId);
    if (!statusTotals.has(key)) statusTotals.set(key, new Map());
    statusTotals.get(key)!.set(r._id.status, r.total);
  }
  const expenseTotals = new Map(expenseAgg.map((r) => [String(r._id), r.total]));

  const out = new Map<string, AccountListFinance>();
  for (const key of new Set([...statusTotals.keys(), ...expenseTotals.keys()])) {
    const byStatus = statusTotals.get(key) ?? new Map<string, number>();
    out.set(key, { ...financeFromTotals(byStatus, expenseTotals.get(key) ?? 0), overdue: byStatus.get("overdue") ?? 0 });
  }
  return out;
}

/** Next sequential invoice number for a workspace (starts at 1001). */
export async function nextInvoiceNumber(workspaceId: Types.ObjectId | string): Promise<number> {
  const last = await Invoice.findOne({ workspaceId })
    .sort({ number: -1 })
    .select("number")
    .lean<{ number: number }>();
  return last ? last.number + 1 : 1001;
}

const isLeadStage = (v: unknown): v is LeadStage => LEAD_STAGES.includes(v as LeadStage);

/**
 * How long a lead spent in each stage, oldest first. Folds every recorded
 * `stage` diff on the lead's audit trail (lane moves, edits, conversion) in
 * one indexed query. A lead with no recorded move gets a single open span
 * starting at `createdAt`.
 */
export async function leadStageSpans(lead: Pick<ILead, "_id" | "workspaceId" | "stage" | "createdAt">): Promise<LeadStageSpan[]> {
  const entries = await AuditLog.find({ workspaceId: lead.workspaceId, leadId: lead._id, "changes.field": "stage" })
    .sort({ createdAt: 1 })
    .select({ changes: 1, createdAt: 1 })
    .lean<Pick<IAuditLog, "changes" | "createdAt">[]>();
  const moves = entries.flatMap((e) => e.changes.filter((c) => c.field === "stage").map((c) => ({ ...c, at: e.createdAt })));

  const spans: LeadStageSpan[] = [];
  const firstFrom = moves[0]?.from;
  let open = { stage: isLeadStage(firstFrom) ? firstFrom : lead.stage, enteredAt: lead.createdAt };
  for (const m of moves) {
    if (!isLeadStage(m.to) || m.to === open.stage) continue;
    spans.push({ stage: open.stage, enteredAt: open.enteredAt.toISOString(), leftAt: m.at.toISOString() });
    open = { stage: m.to, enteredAt: m.at };
  }
  spans.push({ stage: open.stage, enteredAt: open.enteredAt.toISOString(), leftAt: null });
  return spans;
}
