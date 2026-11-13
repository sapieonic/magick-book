import type {
  AgingBucketDTO,
  AgingKey,
  CollectedDTO,
  CollectedSeriesDTO,
  ExpenseDTO,
  InvoiceDTO,
  MoneyTotals,
} from "./types";
import type { InvoiceStatus } from "./constants";

/** Pure money maths shared by `GET /api/money` and the Money page. All dates are UTC. */

export const AGING_KEYS: readonly AgingKey[] = ["current", "d30", "d60", "d60plus"];

export const AGING_LABELS: Record<AgingKey, string> = {
  current: "Current",
  d30: "1–30 days",
  d60: "31–60 days",
  d60plus: "60+ days",
};

export const OTHER_SERIES_KEY = "other";
const OTHER_SERIES_NAME = "Other accounts";
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const MS_PER_DAY = 86_400_000;

/** UTC start of the calendar month `n` months before `d`'s month. */
export function subUtcMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
}

export function utcMonthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-06" → "Jun" (or "June" with `long`). */
export function monthLabel(key: string, long = false): string {
  const m = Number(key.slice(5, 7)) - 1;
  return (long ? MONTH_LONG : MONTH_SHORT)[m] ?? key;
}

/** Whole UTC calendar days from `b` to `a` (a − b). */
export function differenceInUtcCalendarDays(a: Date, b: Date): number {
  const a0 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const b0 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((a0 - b0) / MS_PER_DAY);
}

export function isOutstanding(inv: Pick<InvoiceDTO, "status">): boolean {
  return inv.status === "sent" || inv.status === "overdue";
}

/** Payment date: paidAt, else issuedAt for legacy paid rows; null when unpaid. */
export function paymentDate(inv: InvoiceDTO): Date | null {
  if (inv.status !== "paid") return null;
  const when = inv.paidAt ?? inv.issuedAt;
  return when ? new Date(when) : null;
}

/** Days past the due date (falls back to the issue date). Negative = not yet due. */
export function daysPastDue(inv: InvoiceDTO, now: Date): number {
  return differenceInUtcCalendarDays(now, new Date(inv.dueAt ?? inv.issuedAt));
}

/** Aging band of an outstanding invoice; null for paid and draft invoices. */
export function agingKey(inv: InvoiceDTO, now: Date): AgingKey | null {
  if (!isOutstanding(inv)) return null;
  const days = daysPastDue(inv, now);
  if (days <= 0) return "current";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  return "d60plus";
}

/** Status as the ledger shows it: a sent invoice past its due date reads as overdue. */
export function displayStatus(inv: InvoiceDTO, now: Date): InvoiceStatus {
  return inv.status === "sent" && daysPastDue(inv, now) > 0 ? "overdue" : inv.status;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The ledger's "Age" cell: how late an open invoice is, or how long a paid one took. */
export function invoiceAge(inv: InvoiceDTO, now: Date): { text: string; late: boolean } {
  if (inv.status === "draft") return { text: "Not issued", late: false };
  if (inv.status === "paid") {
    const paid = paymentDate(inv)!;
    const days = Math.max(0, differenceInUtcCalendarDays(paid, new Date(inv.issuedAt)));
    return { text: days === 0 ? "Paid same day" : `${plural(days, "day")} to pay`, late: false };
  }
  const days = daysPastDue(inv, now);
  if (days > 0) return { text: `${plural(days, "day")} overdue`, late: true };
  if (days === 0) return { text: "Due today", late: false };
  return { text: `Due in ${plural(-days, "day")}`, late: false };
}

/** Billed / paid / outstanding / expenses / margin in one pass over each list. */
export function buildMoneyTotals(invoices: InvoiceDTO[], expenses: Pick<ExpenseDTO, "amount">[], now: Date): MoneyTotals {
  const t: MoneyTotals = {
    billed: 0, billedCount: 0, paid: 0, paidCount: 0,
    outstanding: 0, outstandingCount: 0, overdueCount: 0, expenses: 0, margin: 0,
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
      if (daysPastDue(inv, now) > 0) t.overdueCount += 1;
    }
  }
  for (const e of expenses) t.expenses += e.amount;
  t.margin = t.billed > 0 ? Math.max(0, (t.billed - t.expenses) / t.billed) : 0;
  return t;
}

/** Outstanding amount and count per aging band, with the accounts that owe it. */
export function buildOutstandingAging(invoices: InvoiceDTO[], now: Date): AgingBucketDTO[] {
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

/**
 * Paid amounts per UTC month for the last `months` months, stacked by the
 * `topN` accounts that paid most in the window plus an "Other accounts" series.
 */
export function buildCollectedByMonth(
  invoices: InvoiceDTO[],
  now: Date,
  opts: { months?: number; topN?: number } = {},
): CollectedDTO {
  const monthsN = opts.months ?? 6;
  const topN = opts.topN ?? 2;
  const monthKeys = Array.from({ length: monthsN }, (_, i) => utcMonthKey(subUtcMonths(now, monthsN - 1 - i)));
  const monthIndex = new Map(monthKeys.map((k, i) => [k, i]));

  const accounts = new Map<string, { name: string; total: number; perMonth: number[] }>();
  for (const inv of invoices) {
    const when = paymentDate(inv);
    const m = when ? monthIndex.get(utcMonthKey(when)) : undefined;
    if (m === undefined) continue;
    let acc = accounts.get(inv.accountId);
    if (!acc) {
      acc = { name: inv.accountName?.trim() || "Unknown", total: 0, perMonth: new Array(monthsN).fill(0) };
      accounts.set(inv.accountId, acc);
    }
    acc.total += inv.amount;
    acc.perMonth[m] += inv.amount;
  }

  const ranked = [...accounts.entries()].sort((a, b) => b[1].total - a[1].total);
  const top = ranked.slice(0, topN);
  const rest = ranked.slice(topN);

  const series: CollectedSeriesDTO[] = top.map(([id, a]) => ({ key: id, name: a.name, total: a.total }));
  const perSeries = top.map(([, a]) => a.perMonth);
  if (rest.length > 0) {
    const other = new Array<number>(monthsN).fill(0);
    let otherTotal = 0;
    for (const [, a] of rest) {
      a.perMonth.forEach((v, i) => (other[i] += v));
      otherTotal += a.total;
    }
    series.push({ key: OTHER_SERIES_KEY, name: OTHER_SERIES_NAME, total: otherTotal });
    perSeries.push(other);
  }

  const months = monthKeys.map((key, i) => {
    const amounts = perSeries.map((s) => s[i]);
    return { key, total: amounts.reduce((s, v) => s + v, 0), amounts };
  });
  return { months, series, total: series.reduce((s, x) => s + x.total, 0) };
}

/** What the invoice ledger is narrowed to: a side of the equation or an aging band. */
export type LedgerFilter = "all" | "paid" | "outstanding" | AgingKey;

export function matchesLedgerFilter(inv: InvoiceDTO, filter: LedgerFilter, now: Date): boolean {
  if (filter === "all") return true;
  if (filter === "paid") return inv.status === "paid";
  if (filter === "outstanding") return isOutstanding(inv);
  return agingKey(inv, now) === filter;
}

/** Case-insensitive match on account name or invoice number ("1023" or "#1023"). */
export function matchesInvoiceQuery(inv: InvoiceDTO, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  if (!q) return true;
  return String(inv.number).includes(q) || (inv.accountName ?? "").toLowerCase().includes(q);
}

export interface LedgerGroups {
  /** Most overdue first. */
  outstanding: InvoiceDTO[];
  /** Most recently paid first. */
  paid: InvoiceDTO[];
  /** Newest first. */
  draft: InvoiceDTO[];
}

export function groupLedger(invoices: InvoiceDTO[], now: Date): LedgerGroups {
  const groups: LedgerGroups = { outstanding: [], paid: [], draft: [] };
  for (const inv of invoices) {
    if (inv.status === "paid") groups.paid.push(inv);
    else if (inv.status === "draft") groups.draft.push(inv);
    else groups.outstanding.push(inv);
  }
  groups.outstanding.sort((a, b) => daysPastDue(b, now) - daysPastDue(a, now) || b.amount - a.amount);
  groups.paid.sort((a, b) => paymentDate(b)!.getTime() - paymentDate(a)!.getTime());
  groups.draft.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  return groups;
}
