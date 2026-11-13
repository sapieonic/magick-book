import "server-only";
import { Types } from "mongoose";
import { Account, Activity, AuditLog, Invoice, Expense, User, type IAccount, type IAuditLog, type IExpense, type IInvoice, type ILead, type IUser } from "./models";
import { LEAD_STAGES, type ActivityKind, type AuditAction, type AuditEntity, type LeadStage } from "./constants";
import type { AccountFinance, AuditChange, LeadStageSpan } from "./types";
import { HttpError } from "./api";
import { accountScope } from "./rbac";
import { rollupMoney } from "./receivables";

/**
 * Resolve an account the user can see, or throw a 404. `"read"` also resolves
 * an archived account, so its page and tabs stay viewable; `"write"` sees only
 * live accounts, so nothing under an archived account changes until it is
 * restored. Callers still check `canEditOwned()` before mutating.
 */
export async function loadAccount(user: IUser, id: string | Types.ObjectId, access: "read" | "write"): Promise<IAccount> {
  const acc = Types.ObjectId.isValid(id)
    ? await Account.findOne({ _id: id, ...accountScope(user, { archived: access === "read" ? "any" : false }) }).lean<IAccount>()
    : null;
  if (!acc) throw new HttpError("Account not found", 404);
  return acc;
}

const EXPENSE_VENDOR_MAX = 200;

/**
 * The validated expense fields present on a request body, shared by create
 * and edit. Throws a 400 naming the first bad one. Category is the caller's:
 * create falls back to "Other", edit rejects an unknown one.
 */
export function expenseFields(b: Record<string, unknown>): Partial<Pick<IExpense, "amount" | "vendor" | "billable" | "date">> {
  const out: Partial<Pick<IExpense, "amount" | "vendor" | "billable" | "date">> = {};
  if (b.amount !== undefined) {
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError("A positive amount is required");
    out.amount = amount;
  }
  if (typeof b.vendor === "string") {
    const vendor = b.vendor.trim();
    if (vendor.length > EXPENSE_VENDOR_MAX) throw new HttpError(`Keep the vendor or note to ${EXPENSE_VENDOR_MAX} characters`);
    out.vendor = vendor;
  }
  if (typeof b.billable === "boolean") out.billable = b.billable;
  if (b.date !== undefined) {
    const date = typeof b.date === "string" ? new Date(b.date) : null;
    if (!date || Number.isNaN(date.getTime())) throw new HttpError("A valid date is required");
    out.date = date;
  }
  return out;
}

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

/**
 * Money rollup for many accounts at once (list views): one projected invoice
 * read and one expense aggregation, folded per account by `rollupMoney` so
 * "overdue" means the same here as on Today and Money. Accounts with no money
 * rows are absent from the map.
 */
export async function accountFinances(accountIds: Types.ObjectId[]): Promise<Map<string, AccountFinance>> {
  if (!accountIds.length) return new Map();
  const match = { accountId: { $in: accountIds }, deletedAt: null };
  const [invoices, expenseAgg] = await Promise.all([
    Invoice.find(match).select("accountId amount status issuedAt dueAt").lean<Pick<IInvoice, "accountId" | "amount" | "status" | "issuedAt" | "dueAt">[]>(),
    Expense.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: match },
      { $group: { _id: "$accountId", total: { $sum: "$amount" } } },
    ]),
  ]);

  const byAccount = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const key = String(inv.accountId);
    const rows = byAccount.get(key);
    if (rows) rows.push(inv);
    else byAccount.set(key, [inv]);
  }
  const expenseTotals = new Map(expenseAgg.map((r) => [String(r._id), r.total]));

  const now = new Date();
  const out = new Map<string, AccountFinance>();
  for (const key of new Set([...byAccount.keys(), ...expenseTotals.keys()])) {
    const { billed, paid, outstanding, overdue, expenses, margin } = rollupMoney(byAccount.get(key) ?? [], [{ amount: expenseTotals.get(key) ?? 0 }], now);
    out.set(key, { billed, paid, outstanding, overdue, expenses, margin });
  }
  return out;
}

export const NO_FINANCE: AccountFinance = { billed: 0, paid: 0, outstanding: 0, overdue: 0, expenses: 0, margin: 0 };

/** One account's money rollup (see `accountFinances`). */
export async function accountFinance(accountId: Types.ObjectId | string): Promise<AccountFinance> {
  const id = new Types.ObjectId(accountId);
  return (await accountFinances([id])).get(String(id)) ?? NO_FINANCE;
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
