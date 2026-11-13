import type { InvoiceStatus } from "./constants";
import type { AgingBucketDTO, AgingKey, MoneyTotals } from "./types";

/**
 * Pure receivables maths shared by `/api/dashboard`, `/api/money`, the
 * accounts finance rollup and the client screens. Works on lean Mongo docs
 * (Date fields) and DTOs (ISO strings) alike. All calendar maths is UTC, so
 * the server and every browser agree on which day an invoice fell due.
 *
 * One rule everywhere: an invoice is **outstanding** while sent or overdue,
 * ages from its due date (else its issue date), and is **overdue** once it is
 * outstanding and either past that date or explicitly marked overdue.
 */

type DateLike = string | Date;

export interface InvoiceLike {
  status: InvoiceStatus;
  amount: number;
  issuedAt: DateLike;
  dueAt?: DateLike | null;
  paidAt?: DateLike | null;
}

const AGING_KEYS: readonly AgingKey[] = ["current", "d30", "d60", "d60plus"];

export const AGING_LABELS: Record<AgingKey, string> = {
  current: "Not yet due",
  d30: "1–30 days",
  d60: "31–60 days",
  d60plus: "60+ days",
};

/** Band colour: amber while not yet due, deepening red as it ages. */
export const AGING_COLORS: Record<AgingKey, string> = {
  current: "var(--color-due-fill)",
  d30: "color-mix(in srgb, var(--color-overdue-fill) 55%, transparent)",
  d60: "color-mix(in srgb, var(--color-overdue-fill) 75%, transparent)",
  d60plus: "var(--color-overdue-fill)",
};

const MS_PER_DAY = 86_400_000;

/** Whole UTC calendar days from `b` to `a` (a − b). */
export function differenceInUtcCalendarDays(a: Date, b: Date): number {
  const a0 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const b0 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((a0 - b0) / MS_PER_DAY);
}

/** UTC start of the calendar month `n` months before `d`'s month. */
export function subUtcMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
}

/** Sent or overdue: billed and not yet paid. Drafts were never billed. */
export function isOutstanding(inv: Pick<InvoiceLike, "status">): boolean {
  return inv.status === "sent" || inv.status === "overdue";
}

/** The date an invoice ages from: its due date, or its issue date when it has none. */
export function agingDate(inv: Pick<InvoiceLike, "issuedAt" | "dueAt">): Date {
  return new Date(inv.dueAt ?? inv.issuedAt);
}

/** Whole UTC calendar days past the aging date; zero or negative means not yet due. */
export function daysPastDue(inv: Pick<InvoiceLike, "issuedAt" | "dueAt">, now: Date): number {
  return differenceInUtcCalendarDays(now, agingDate(inv));
}

/**
 * Aging band of an outstanding invoice (null for paid and draft). An invoice
 * marked overdue before its date comes round still counts as 1–30 days.
 */
export function agingKey(inv: Pick<InvoiceLike, "status" | "issuedAt" | "dueAt">, now: Date): AgingKey | null {
  if (!isOutstanding(inv)) return null;
  const days = daysPastDue(inv, now);
  if (days <= 0) return inv.status === "overdue" ? "d30" : "current";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  return "d60plus";
}

/** Outstanding and past due (or marked overdue). The one definition every screen uses. */
export function isOverdue(inv: Pick<InvoiceLike, "status" | "issuedAt" | "dueAt">, now: Date): boolean {
  const key = agingKey(inv, now);
  return key !== null && key !== "current";
}

/** Status as screens show it: a sent invoice past its due date reads as overdue. */
export function displayStatus(inv: Pick<InvoiceLike, "status" | "issuedAt" | "dueAt">, now: Date): InvoiceStatus {
  return isOverdue(inv, now) ? "overdue" : inv.status;
}

/** Payment date: paidAt, else issuedAt for legacy paid rows; null when unpaid. */
export function paymentDate(inv: Pick<InvoiceLike, "status" | "issuedAt" | "paidAt">): Date | null {
  if (inv.status !== "paid") return null;
  return new Date(inv.paidAt ?? inv.issuedAt);
}

/**
 * Billed / paid / outstanding / overdue / expenses / margin in one pass: the
 * Money page totals and (picked down to `AccountFinance`) every account's rollup.
 */
export function rollupMoney(invoices: InvoiceLike[], expenses: { amount: number }[], now: Date): MoneyTotals {
  const t: MoneyTotals = {
    billed: 0, billedCount: 0, paid: 0, paidCount: 0, outstanding: 0, outstandingCount: 0,
    overdue: 0, overdueCount: 0, expenses: 0, margin: 0,
  };
  for (const inv of invoices) {
    if (inv.status === "draft") continue;
    t.billed += inv.amount;
    t.billedCount += 1;
    if (inv.status === "paid") {
      t.paid += inv.amount;
      t.paidCount += 1;
    } else {
      t.outstanding += inv.amount;
      t.outstandingCount += 1;
      if (isOverdue(inv, now)) {
        t.overdue += inv.amount;
        t.overdueCount += 1;
      }
    }
  }
  for (const e of expenses) t.expenses += e.amount;
  t.margin = t.billed > 0 ? Math.max(0, (t.billed - t.expenses) / t.billed) : 0;
  return t;
}

/** Outstanding amount and count per aging band, with the accounts that owe it (largest first). */
export function buildOutstandingAging(invoices: (InvoiceLike & { accountName?: string })[], now: Date): AgingBucketDTO[] {
  const sums = new Map(AGING_KEYS.map((k) => [k, { amount: 0, count: 0, byAccount: new Map<string, number>() }]));
  for (const inv of invoices) {
    const key = agingKey(inv, now);
    if (!key) continue;
    const slot = sums.get(key)!;
    slot.amount += inv.amount;
    slot.count += 1;
    const name = inv.accountName?.trim() || "Unknown";
    slot.byAccount.set(name, (slot.byAccount.get(name) ?? 0) + inv.amount);
  }
  return AGING_KEYS.map((key) => {
    const { amount, count, byAccount } = sums.get(key)!;
    const accounts = [...byAccount.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    return { key, amount, count, accounts };
  });
}

/** Accounts ranked by what they owe, largest first. */
export function rankDebtors(invoices: (InvoiceLike & { accountId: string })[]): { accountId: string; amount: number; invoices: number }[] {
  const byAccount = new Map<string, { accountId: string; amount: number; invoices: number }>();
  for (const inv of invoices) {
    if (!isOutstanding(inv)) continue;
    const row = byAccount.get(inv.accountId) ?? { accountId: inv.accountId, amount: 0, invoices: 0 };
    row.amount += inv.amount;
    row.invoices += 1;
    byAccount.set(inv.accountId, row);
  }
  return [...byAccount.values()].sort((a, b) => b.amount - a.amount);
}

export interface Collections<T> {
  thisMonth: number;
  lastMonth: number;
  /** Payments received this UTC calendar month, most recent first. */
  payments: T[];
}

/** Money received this UTC calendar month and last, by payment date. */
export function collections<T extends InvoiceLike>(invoices: T[], now: Date): Collections<T> {
  const monthStart = subUtcMonths(now, 0);
  const prevStart = subUtcMonths(now, 1);
  const result: Collections<T> = { thisMonth: 0, lastMonth: 0, payments: [] };
  for (const inv of invoices) {
    const when = paymentDate(inv);
    if (!when || when > now) continue;
    if (when >= monthStart) {
      result.thisMonth += inv.amount;
      result.payments.push(inv);
    } else if (when >= prevStart) {
      result.lastMonth += inv.amount;
    }
  }
  result.payments.sort((a, b) => paymentDate(b)!.getTime() - paymentDate(a)!.getTime());
  return result;
}
