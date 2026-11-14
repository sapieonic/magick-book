import { type NextRequest } from "next/server";
import { ok, fail, route, serializeExpense, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Expense, type IAccount, type IExpense, type IUser } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { canEditOwned } from "@/lib/rbac";
import { audit, diffChanges, expenseFields, loadAccount, logActivity } from "@/lib/services";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { formatINR } from "@/lib/utils";
import { isoDay } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string; expenseId: string }> };

/**
 * Resolve the live, owner-editable account and one of its expenses: a live
 * one, or an archived one for restore.
 */
async function loadOwned(user: IUser, id: string, expenseId: string, opts?: { archived?: boolean }) {
  const acc = await loadAccount(user, id, "write");
  if (!canEditOwned(user, acc.ownerId)) throw new HttpError("You can only manage expenses on your own accounts.", 403);
  const exp = await Expense.findOne({ _id: expenseId, accountId: acc._id, deletedAt: opts?.archived ? { $ne: null } : null }).lean<IExpense>();
  if (!exp) throw new HttpError("Expense not found", 404);
  return { acc, exp };
}

const label = (e: Pick<IExpense, "category" | "amount">) => `${e.category} · ${formatINR(e.amount)}`;

/** Account timeline entry for a change to an expense, plus the activity bump. */
async function logExpense(user: IUser, acc: IAccount, exp: Pick<IExpense, "category" | "vendor" | "amount">, verb: string) {
  await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  await logActivity({
    workspaceId: user.workspaceId,
    accountId: acc._id,
    actorId: user._id,
    kind: "expense",
    title: `${exp.category} expense ${verb}`,
    detail: `${exp.vendor || "Expense"} · ${formatINR(exp.amount)}`,
  });
}

// PATCH /api/accounts/:id/expenses/:expenseId — edit fields, or restore an archived expense (action: "restore").
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id, expenseId } = await ctx.params;
  const b = await req.json().catch(() => ({}));

  if (b.action === "restore") {
    const { acc, exp } = await loadOwned(user, id, expenseId, { archived: true });
    // Claim the archived row atomically so a concurrent restore can't log twice.
    const claimed = await Expense.updateOne({ _id: exp._id, deletedAt: { $ne: null } }, { $unset: { deletedAt: "", deletedBy: "" } });
    if (claimed.matchedCount === 0) throw new HttpError("Expense not found", 404);
    await logExpense(user, acc, exp, "restored");
    await audit({ entity: "expense", entityId: exp._id, entityLabel: label(exp), action: "restore", actor: user, accountId: acc._id });
    const fresh = await Expense.findById(exp._id).lean<IExpense>();
    return ok({ expense: serializeExpense(fresh!) });
  }

  const { acc, exp } = await loadOwned(user, id, expenseId);
  const fields = expenseFields(b);
  // The date is a calendar day: the same IST day is no change, whatever instant an older row was stored at.
  if (fields.date && isoDay(fields.date) === isoDay(exp.date)) delete fields.date;
  const patch: Record<string, unknown> = fields;
  if (b.category !== undefined) {
    if (!EXPENSE_CATEGORIES.includes(b.category)) return fail("Unknown expense category");
    patch.category = b.category;
  }

  const changes = diffChanges(exp as unknown as Record<string, unknown>, patch, ["amount", "category", "vendor", "billable", "date"]);
  if (changes.length === 0) return ok({ expense: serializeExpense(exp) });

  await Expense.updateOne({ _id: exp._id }, patch);
  const fresh = (await Expense.findById(exp._id).lean<IExpense>())!;
  await logExpense(user, acc, fresh, "edited");
  await audit({ entity: "expense", entityId: exp._id, entityLabel: label(fresh), action: "update", actor: user, changes, accountId: acc._id });
  return ok({ expense: serializeExpense(fresh) });
});

// DELETE /api/accounts/:id/expenses/:expenseId — soft-delete; it drops out of the margin until restored.
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id, expenseId } = await ctx.params;
  const { acc, exp } = await loadOwned(user, id, expenseId);

  const claimed = await Expense.updateOne({ _id: exp._id, deletedAt: null }, { deletedAt: new Date(), deletedBy: user._id });
  if (claimed.matchedCount === 0) throw new HttpError("Expense not found", 404);
  await logExpense(user, acc, exp, "removed");
  await audit({ entity: "expense", entityId: exp._id, entityLabel: label(exp), action: "delete", actor: user, accountId: acc._id });
  return ok({ ok: true });
});
