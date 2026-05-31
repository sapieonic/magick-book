import "server-only";
import { Types } from "mongoose";
import { Activity, AuditLog, Invoice, Expense, User, type IUser } from "./models";
import type { ActivityKind, AuditAction, AuditEntity } from "./constants";
import type { AccountFinance, AuditChange } from "./types";

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

  const byStatus = new Map(invoiceAgg.map((r) => [r._id, r.total]));
  const billed = (byStatus.get("sent") ?? 0) + (byStatus.get("paid") ?? 0) + (byStatus.get("overdue") ?? 0);
  const paid = byStatus.get("paid") ?? 0;
  const outstanding = (byStatus.get("sent") ?? 0) + (byStatus.get("overdue") ?? 0);
  const expenses = expenseAgg[0]?.total ?? 0;
  const margin = billed > 0 ? Math.max(0, (billed - expenses) / billed) : 0;

  return { billed, paid, outstanding, expenses, margin };
}

/** Next sequential invoice number for a workspace (starts at 1001). */
export async function nextInvoiceNumber(workspaceId: Types.ObjectId | string): Promise<number> {
  const last = await Invoice.findOne({ workspaceId })
    .sort({ number: -1 })
    .select("number")
    .lean<{ number: number }>();
  return last ? last.number + 1 : 1001;
}
