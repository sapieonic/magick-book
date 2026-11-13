import { differenceInCalendarDays, format } from "date-fns";
import type { ExpenseDTO, InvoiceDTO } from "@/lib/types";

/** "31 Oct 2026". */
export const longDate = (d: string | Date) => format(new Date(d), "dd MMM yyyy");
/** "31 Oct". */
export const shortDate = (d: string | Date) => format(new Date(d), "d MMM");

/** Whole days past the due date for an unpaid, billed invoice; 0 when not late. */
export function daysOverdue(inv: Pick<InvoiceDTO, "status" | "dueAt">, now = new Date()): number {
  if (!inv.dueAt || (inv.status !== "sent" && inv.status !== "overdue")) return 0;
  return Math.max(0, differenceInCalendarDays(now, new Date(inv.dueAt)));
}

/** "Overdue 6 days" / "Overdue" for the status pill. */
export function overdueLabel(inv: Pick<InvoiceDTO, "status" | "dueAt">, now = new Date()): string {
  const days = daysOverdue(inv, now);
  return days > 0 ? `Overdue ${days} ${days === 1 ? "day" : "days"}` : "Overdue";
}

interface EntryBase {
  key: string;
  date: string;
  /** Outstanding balance after this entry. */
  balance: number;
}

export type StatementEntry =
  /** `counted` is false for drafts: listed, but not billed and not in the balance. */
  | (EntryBase & { kind: "invoice"; invoice: InvoiceDTO; counted: boolean })
  | (EntryBase & { kind: "payment"; invoice: InvoiceDTO })
  | (EntryBase & { kind: "expense"; expense: ExpenseDTO });

export interface Statement {
  /** Newest first. */
  entries: StatementEntry[];
  totals: { billed: number; received: number; cost: number; balance: number; invoices: number; payments: number };
}

const ORDER: Record<StatementEntry["kind"], number> = { invoice: 0, payment: 1, expense: 2 };

/**
 * The account statement: every invoice, every payment (a paid invoice, dated
 * by `paidAt`) and every expense in date order, with the outstanding balance
 * after each. Billing raises the balance, a payment lowers it, an expense
 * leaves it alone. The closing balance equals the account's outstanding total.
 */
export function buildStatement(invoices: InvoiceDTO[], expenses: ExpenseDTO[]): Statement {
  const rows: { entry: StatementEntry; delta: number }[] = [];
  for (const invoice of invoices) {
    const counted = invoice.status !== "draft";
    rows.push({ entry: { kind: "invoice", key: `i-${invoice.id}`, date: invoice.issuedAt, invoice, counted, balance: 0 }, delta: counted ? invoice.amount : 0 });
    if (invoice.status === "paid") {
      rows.push({ entry: { kind: "payment", key: `p-${invoice.id}`, date: invoice.paidAt ?? invoice.issuedAt, invoice, balance: 0 }, delta: -invoice.amount });
    }
  }
  for (const expense of expenses) rows.push({ entry: { kind: "expense", key: `e-${expense.id}`, date: expense.date, expense, balance: 0 }, delta: 0 });

  rows.sort((a, b) => new Date(a.entry.date).getTime() - new Date(b.entry.date).getTime() || ORDER[a.entry.kind] - ORDER[b.entry.kind]);

  const totals = { billed: 0, received: 0, cost: 0, balance: 0, invoices: 0, payments: 0 };
  for (const { entry, delta } of rows) {
    totals.balance += delta;
    entry.balance = totals.balance;
    if (entry.kind === "invoice" && entry.counted) {
      totals.billed += entry.invoice.amount;
      totals.invoices += 1;
    } else if (entry.kind === "payment") {
      totals.received += entry.invoice.amount;
      totals.payments += 1;
    } else if (entry.kind === "expense") {
      totals.cost += entry.expense.amount;
    }
  }
  return { entries: rows.map((r) => r.entry).reverse(), totals };
}
