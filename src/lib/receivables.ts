import { differenceInCalendarDays } from "date-fns";
import type { InvoiceStatus } from "./constants";
import type { ReceivablesAging } from "./types";

/**
 * Pure receivables maths for the Today dashboard: aging, who owes, and what was
 * collected. Works on plain invoice-like rows so it runs on lean Mongo docs and
 * in unit tests alike. Calendar boundaries use the process's local time zone.
 */

export interface ReceivableInvoice {
  accountId: string;
  number: number;
  amount: number;
  status: InvoiceStatus;
  issuedAt: Date;
  dueAt?: Date | null;
  paidAt?: Date | null;
}

export type AgingKey = keyof ReceivablesAging;

/** Sent or overdue: billed and not yet paid. Drafts were never billed. */
export function isOutstanding(status: InvoiceStatus): boolean {
  return status === "sent" || status === "overdue";
}

/** The date an invoice ages from: its due date, or its issue date when it has none. */
export function agingDate(inv: Pick<ReceivableInvoice, "issuedAt" | "dueAt">): Date {
  return inv.dueAt ?? inv.issuedAt;
}

/** Whole calendar days past the aging date; zero or negative means not yet due. */
export function daysPastDue(inv: Pick<ReceivableInvoice, "issuedAt" | "dueAt">, now: Date): number {
  return differenceInCalendarDays(now, agingDate(inv));
}

export function agingKey(daysPast: number): AgingKey {
  if (daysPast <= 0) return "current";
  if (daysPast <= 30) return "d1_30";
  if (daysPast <= 60) return "d31_60";
  return "d60plus";
}

/** Outstanding amounts split into Current, 1–30, 31–60 and 60+ days past due. */
export function outstandingAging(invoices: ReceivableInvoice[], now: Date): ReceivablesAging {
  const aging: ReceivablesAging = { current: 0, d1_30: 0, d31_60: 0, d60plus: 0 };
  for (const inv of invoices) {
    if (isOutstanding(inv.status)) aging[agingKey(daysPastDue(inv, now))] += inv.amount;
  }
  return aging;
}

/** Accounts ranked by what they owe, largest first. */
export function rankDebtors(invoices: ReceivableInvoice[]): { accountId: string; amount: number; invoices: number }[] {
  const byAccount = new Map<string, { accountId: string; amount: number; invoices: number }>();
  for (const inv of invoices) {
    if (!isOutstanding(inv.status)) continue;
    const row = byAccount.get(inv.accountId) ?? { accountId: inv.accountId, amount: 0, invoices: 0 };
    row.amount += inv.amount;
    row.invoices += 1;
    byAccount.set(inv.accountId, row);
  }
  return [...byAccount.values()].sort((a, b) => b.amount - a.amount);
}

/** When a paid invoice was paid: `paidAt`, or its issue date for rows paid before `paidAt` existed. */
export function paidOn(inv: ReceivableInvoice): Date | null {
  if (inv.status !== "paid") return null;
  return inv.paidAt ?? inv.issuedAt;
}

export interface Collections {
  thisMonth: number;
  lastMonth: number;
  /** Payments received this calendar month, most recent first. */
  payments: ReceivableInvoice[];
}

/** Money received this calendar month and last, by payment date. */
export function collections(invoices: ReceivableInvoice[], now: Date): Collections {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const result: Collections = { thisMonth: 0, lastMonth: 0, payments: [] };
  for (const inv of invoices) {
    const when = paidOn(inv);
    if (!when || when > now) continue;
    if (when >= monthStart) {
      result.thisMonth += inv.amount;
      result.payments.push(inv);
    } else if (when >= prevStart) {
      result.lastMonth += inv.amount;
    }
  }
  result.payments.sort((a, b) => paidOn(b)!.getTime() - paidOn(a)!.getTime());
  return result;
}
