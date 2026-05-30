import { type NextRequest } from "next/server";
import { ok, fail, route, serializeExpense, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Expense, type IAccount, type IExpense } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";
import { logActivity } from "@/lib/services";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { formatINR } from "@/lib/utils";
import { Types } from "mongoose";

type Ctx = { params: Promise<{ id: string }> };

async function requireAccount(scope: Record<string, unknown>, id: string): Promise<IAccount> {
  const acc = await Account.findOne({ _id: id, ...scope }).lean<IAccount>();
  if (!acc) throw new HttpError("Account not found", 404);
  return acc;
}

export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  await requireAccount(accountScope(user), id);
  const expenses = await Expense.find({ accountId: id }).sort({ date: -1 }).lean<IExpense[]>();
  return ok({ expenses: expenses.map((e) => serializeExpense(e)) });
});

export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await requireAccount(accountScope(user), id);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only log expenses on your own accounts.", 403);

  const b = await req.json().catch(() => ({}));
  const amount = Number(b.amount);
  if (!amount || amount <= 0) return fail("A positive amount is required");
  const category = EXPENSE_CATEGORIES.includes(b.category) ? b.category : "Other";

  const exp = await Expense.create({
    workspaceId: user.workspaceId,
    accountId: acc._id,
    date: b.date ? new Date(b.date) : new Date(),
    category,
    vendor: b.vendor?.trim() || "",
    amount,
    billable: !!b.billable,
  });
  await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  await logActivity({
    workspaceId: user.workspaceId as unknown as Types.ObjectId,
    accountId: acc._id,
    actorId: user._id,
    kind: "expense",
    title: `${category} expense`,
    detail: `${b.vendor?.trim() || "Expense"} · ${formatINR(amount)}`,
  });

  return ok({ expense: serializeExpense(exp.toObject()) }, 201);
});
