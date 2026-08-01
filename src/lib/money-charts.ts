import { parseISO } from "date-fns";
import type { InvoiceDTO } from "./types";

export const AGING_BUCKETS = ["Current", "1–30 days", "31–60 days", "60+ days"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Stable Recharts dataKey + display name (avoids colliding with row.month / row.key). */
export interface AccountSeries {
  key: string;
  name: string;
}

export interface PaidByAccountMonth {
  /** Short month label, e.g. "Mar" */
  month: string;
  /** Sortable key yyyy-MM (UTC) */
  key: string;
  /** Series key → amount paid that month */
  [seriesKey: string]: string | number;
}

export interface PaidByAccountSeries {
  /** Last N UTC calendar months, oldest → newest */
  months: PaidByAccountMonth[];
  /** Legend order: top accounts then Other (if present) */
  accounts: AccountSeries[];
  totalPaid: number;
}

export interface AgingRow {
  bucket: AgingBucket;
  amount: number;
  count: number;
}

const OTHER_NAME = "Other accounts";
const OTHER_KEY = "__other__";
const TOP_ACCOUNTS = 5;
const DEFAULT_MONTHS = 6;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MS_PER_DAY = 86_400_000;

/** UTC start of the calendar month containing `d`. */
export function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** UTC start of the calendar month `n` months before `d`'s month. */
export function subUtcMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
}

export function utcMonthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function utcMonthLabel(d: Date): string {
  return MONTH_LABELS[d.getUTCMonth()]!;
}

/** Whole UTC calendar days from `b` to `a` (a − b). */
export function differenceInUtcCalendarDays(a: Date, b: Date): number {
  const a0 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const b0 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((a0 - b0) / MS_PER_DAY);
}

function seriesKeyFor(accountName: string): string {
  return `acct:${accountName}`;
}

/** Payment date for charting: paidAt, else issuedAt for legacy paid rows. */
export function paymentDate(inv: InvoiceDTO): Date | null {
  if (inv.status !== "paid") return null;
  if (inv.paidAt) return parseISO(inv.paidAt);
  if (inv.issuedAt) return parseISO(inv.issuedAt);
  return null;
}

/**
 * Stacked month-on-month paid totals by account (UTC month buckets).
 * Top accounts by total paid in the window; remainder rolled into "Other".
 */
export function buildPaidByAccountMoM(
  invoices: InvoiceDTO[],
  opts: { months?: number; now?: Date; topN?: number } = {},
): PaidByAccountSeries {
  const monthsN = opts.months ?? DEFAULT_MONTHS;
  const topN = opts.topN ?? TOP_ACCOUNTS;
  const now = opts.now ?? new Date();
  const windowStart = subUtcMonths(now, monthsN - 1);

  // Build empty month slots oldest → newest.
  const monthKeys: string[] = [];
  const monthLabels: string[] = [];
  for (let i = monthsN - 1; i >= 0; i--) {
    const d = subUtcMonths(now, i);
    monthKeys.push(utcMonthKey(d));
    monthLabels.push(utcMonthLabel(d));
  }

  // Sum per account per month within the window.
  const byAccount = new Map<string, Map<string, number>>();
  const accountTotals = new Map<string, number>();
  let totalPaid = 0;

  for (const inv of invoices) {
    const when = paymentDate(inv);
    if (!when || when < windowStart) continue;
    const mk = utcMonthKey(when);
    if (!monthKeys.includes(mk)) continue;
    const name = inv.accountName?.trim() || "Unknown";
    if (!byAccount.has(name)) byAccount.set(name, new Map());
    const monthMap = byAccount.get(name)!;
    monthMap.set(mk, (monthMap.get(mk) ?? 0) + inv.amount);
    accountTotals.set(name, (accountTotals.get(name) ?? 0) + inv.amount);
    totalPaid += inv.amount;
  }

  const ranked = [...accountTotals.entries()].sort((a, b) => b[1] - a[1]);
  const topNames = ranked.slice(0, topN).map(([n]) => n);
  const rest = new Set(ranked.slice(topN).map(([n]) => n));
  const accounts: AccountSeries[] = topNames.map((name) => ({
    key: seriesKeyFor(name),
    name,
  }));
  if (rest.size > 0) accounts.push({ key: OTHER_KEY, name: OTHER_NAME });

  const months: PaidByAccountMonth[] = monthKeys.map((key, i) => {
    const row: PaidByAccountMonth = { month: monthLabels[i]!, key };
    for (const a of accounts) row[a.key] = 0;
    for (const [name, monthMap] of byAccount) {
      const amt = monthMap.get(key) ?? 0;
      if (!amt) continue;
      const sk = rest.has(name) ? OTHER_KEY : seriesKeyFor(name);
      row[sk] = (row[sk] as number) + amt;
    }
    return row;
  });

  return { months, accounts, totalPaid };
}

/** Outstanding (sent/overdue) amounts bucketed by UTC days past due. */
export function buildOutstandingAging(
  invoices: InvoiceDTO[],
  opts: { now?: Date } = {},
): AgingRow[] {
  const now = opts.now ?? new Date();
  const sums = new Map<AgingBucket, { amount: number; count: number }>();
  for (const b of AGING_BUCKETS) sums.set(b, { amount: 0, count: 0 });

  for (const inv of invoices) {
    if (inv.status !== "sent" && inv.status !== "overdue") continue;
    const due = inv.dueAt ? parseISO(inv.dueAt) : parseISO(inv.issuedAt);
    const daysPast = differenceInUtcCalendarDays(now, due);
    let bucket: AgingBucket;
    if (daysPast <= 0) bucket = "Current";
    else if (daysPast <= 30) bucket = "1–30 days";
    else if (daysPast <= 60) bucket = "31–60 days";
    else bucket = "60+ days";
    const slot = sums.get(bucket)!;
    slot.amount += inv.amount;
    slot.count += 1;
  }

  return AGING_BUCKETS.map((bucket) => ({
    bucket,
    amount: sums.get(bucket)!.amount,
    count: sums.get(bucket)!.count,
  }));
}

/** Palette for stacked account series — brand-adjacent, distinct. */
export const ACCOUNT_SERIES_COLORS = [
  "#6d5cf5", // violet-500
  "#2f9ae8", // brand-from
  "#15a05a", // success
  "#c8810a", // warn
  "#d6483f", // danger
  "#7b3ff2", // brand-to
  "#8b8893", // muted → Other
];

export function accountColor(index: number, seriesKey: string): string {
  if (seriesKey === OTHER_KEY) return ACCOUNT_SERIES_COLORS[ACCOUNT_SERIES_COLORS.length - 1]!;
  return ACCOUNT_SERIES_COLORS[index % (ACCOUNT_SERIES_COLORS.length - 1)]!;
}

export const AGING_COLORS: Record<AgingBucket, string> = {
  Current: "#15a05a",
  "1–30 days": "#c8810a",
  "31–60 days": "#d6483f",
  "60+ days": "#9f2d26",
};
