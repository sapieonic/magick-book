import { ok, route, serializeInvoice, serializeExpense } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Invoice, Expense, type IAccount, type IInvoice, type IExpense } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope } from "@/lib/rbac";
import { buildCollectedByMonth, buildMoneyTotals, buildOutstandingAging } from "@/lib/money-charts";
import type { MoneySummary } from "@/lib/types";

// GET /api/money — invoices + expenses across visible accounts, with the
// totals, outstanding aging and collected-by-month series derived from them.
export const GET = route(async () => {
  const user = await requireUser();
  await connectDB();

  // Restrict to accounts the user can see (RBAC), then their money rows.
  const accounts = await Account.find(accountScope(user)).select("name").lean<Pick<IAccount, "_id" | "name">[]>();
  const accIds = accounts.map((a) => a._id);
  const nameMap = new Map(accounts.map((a) => [String(a._id), a.name]));

  const [invoiceDocs, expenseDocs] = await Promise.all([
    Invoice.find({ accountId: { $in: accIds }, deletedAt: null }).sort({ issuedAt: -1 }).lean<IInvoice[]>(),
    Expense.find({ accountId: { $in: accIds }, deletedAt: null }).sort({ date: -1 }).lean<IExpense[]>(),
  ]);
  const invoices = invoiceDocs.map((i) => serializeInvoice(i, nameMap.get(String(i.accountId))));
  const expenses = expenseDocs.map((e) => serializeExpense(e, nameMap.get(String(e.accountId))));

  const now = new Date();
  const body: MoneySummary = {
    asOf: now.toISOString(),
    invoices,
    expenses,
    totals: buildMoneyTotals(invoices, expenses, now),
    aging: buildOutstandingAging(invoices, now),
    collected: buildCollectedByMonth(invoices, now),
  };
  return ok(body);
});
