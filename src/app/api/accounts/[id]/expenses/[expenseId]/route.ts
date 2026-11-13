import { type NextRequest } from "next/server";
import { ok, fail, route, serializeExpense, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Expense, type IAccount, type IExpense, type IUser } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";
import { audit, diffChanges } from "@/lib/services";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { formatINR } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

/** Resolve the account (live scope, owner-editable) and one of its live expenses. */
async function loadOwned(user: IUser, id: string, expenseId: string) {
  const acc = await Account.findOne({ _id: id, ...accountScope(user) }).lean<IAccount>();
  if (!acc) throw new HttpError("Account not found", 404);
  if (!canEditOwned(user, acc.ownerId)) throw new HttpError("You can only manage expenses on your own accounts.", 403);
  const exp = await Expense.findOne({ _id: expenseId, accountId: acc._id, deletedAt: null }).lean<IExpense>();
  if (!exp) throw new HttpError("Expense not found", 404);
  return { acc, exp };
}

const label = (e: Pick<IExpense, "category" | "amount">) => `${e.category} · ${formatINR(e.amount)}`;

// PATCH /api/accounts/:id/expenses/:expenseId — edit an expense's fields.
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id, expenseId } = await ctx.params;
  const { acc, exp } = await loadOwned(user, id, expenseId);

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (b.amount !== undefined) {
    const amount = Number(b.amount);
    if (!amount || amount <= 0) return fail("A positive amount is required");
    patch.amount = amount;
  }
  if (b.category !== undefined) {
    if (!EXPENSE_CATEGORIES.includes(b.category)) return fail("Unknown expense category");
    patch.category = b.category;
  }
  if (typeof b.vendor === "string") patch.vendor = b.vendor.trim();
  if (typeof b.billable === "boolean") patch.billable = b.billable;
  if (b.date !== undefined) {
    const date = new Date(b.date);
    if (isNaN(date.getTime())) return fail("A valid date is required");
    patch.date = date;
  }

  const changes = diffChanges(exp as unknown as Record<string, unknown>, patch, ["amount", "category", "vendor", "billable", "date"]);
  await Expense.updateOne({ _id: exp._id }, patch);
  await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  const fresh = await Expense.findById(exp._id).lean<IExpense>();
  await audit({ entity: "expense", entityId: exp._id, entityLabel: label(fresh!), action: "update", actor: user, changes, accountId: acc._id });
  return ok({ expense: serializeExpense(fresh!) });
});

// DELETE /api/accounts/:id/expenses/:expenseId — soft-delete; it drops out of the margin.
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id, expenseId } = await ctx.params;
  const { acc, exp } = await loadOwned(user, id, expenseId);

  await Expense.updateOne({ _id: exp._id }, { deletedAt: new Date(), deletedBy: user._id });
  await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  await audit({ entity: "expense", entityId: exp._id, entityLabel: label(exp), action: "delete", actor: user, accountId: acc._id });
  return ok({ ok: true });
});
