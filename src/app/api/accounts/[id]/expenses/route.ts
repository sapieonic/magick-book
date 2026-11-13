import { type NextRequest } from "next/server";
import { ok, fail, route, serializeExpense } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Expense, type IExpense } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { canEditOwned } from "@/lib/rbac";
import { logActivity, audit, expenseFields, loadAccount } from "@/lib/services";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { formatINR } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/accounts/:id/expenses — newest first (archived accounts too).
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await loadAccount(user, id, "read");
  const expenses = await Expense.find({ accountId: acc._id, deletedAt: null }).sort({ date: -1 }).lean<IExpense[]>();
  return ok({ expenses: expenses.map((e) => serializeExpense(e)) });
});

// POST /api/accounts/:id/expenses — log an expense on a live account.
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await loadAccount(user, id, "write");
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only log expenses on your own accounts.", 403);

  const b = await req.json().catch(() => ({}));
  const { amount, vendor = "", billable = false, date = new Date() } = expenseFields(b);
  if (amount === undefined) return fail("A positive amount is required");
  const category = EXPENSE_CATEGORIES.includes(b.category) ? b.category : "Other";

  const exp = await Expense.create({ workspaceId: user.workspaceId, accountId: acc._id, date, category, vendor, amount, billable });
  await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  await logActivity({
    workspaceId: user.workspaceId,
    accountId: acc._id,
    actorId: user._id,
    kind: "expense",
    title: `${category} expense`,
    detail: `${vendor || "Expense"} · ${formatINR(amount)}`,
  });
  await audit({ entity: "expense", entityId: exp._id, entityLabel: `${category} · ${formatINR(amount)}`, action: "create", actor: user, accountId: acc._id });

  return ok({ expense: serializeExpense(exp.toObject()) }, 201);
});
