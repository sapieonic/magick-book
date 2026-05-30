import "server-only";
import { Types } from "mongoose";
import { Activity, Invoice, Expense, User } from "./models";
import type { ActivityKind } from "./constants";
import type { AccountFinance } from "./types";

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
      { $match: { accountId: accId } },
      { $group: { _id: "$status", total: { $sum: "$amount" } } },
    ]),
    Expense.aggregate<{ _id: null; total: number }>([
      { $match: { accountId: accId } },
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
