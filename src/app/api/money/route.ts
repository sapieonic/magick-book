import { ok, route, serializeInvoice, serializeExpense } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Invoice, Expense, type IAccount, type IInvoice, type IExpense } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope } from "@/lib/rbac";

// GET /api/money — workspace-wide invoices + expenses across visible accounts.
export const GET = route(async () => {
  const user = await requireUser();
  await connectDB();

  // Restrict to accounts the user can see (RBAC), then their money rows.
  const accounts = await Account.find(accountScope(user)).select("name").lean<Pick<IAccount, "_id" | "name">[]>();
  const accIds = accounts.map((a) => a._id);
  const nameMap = new Map(accounts.map((a) => [String(a._id), a.name]));

  const [invoices, expenses] = await Promise.all([
    Invoice.find({ accountId: { $in: accIds } }).sort({ issuedAt: -1 }).lean<IInvoice[]>(),
    Expense.find({ accountId: { $in: accIds } }).sort({ date: -1 }).lean<IExpense[]>(),
  ]);

  const billed = invoices.filter((i) => i.status !== "draft").reduce((s, i) => s + i.amount, 0);
  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return ok({
    invoices: invoices.map((i) => serializeInvoice(i, nameMap.get(String(i.accountId)))),
    expenses: expenses.map((e) => serializeExpense(e, nameMap.get(String(e.accountId)))),
    totals: { billed, paid, outstanding, expenses: totalExpenses, margin: billed > 0 ? Math.max(0, (billed - totalExpenses) / billed) : 0 },
  });
});
