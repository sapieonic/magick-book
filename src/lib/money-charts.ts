import type { AgingKey, CollectedDTO, CollectedSeriesDTO, InvoiceDTO } from "./types";
import { agingKey, daysPastDue, differenceInUtcCalendarDays, isOutstanding, paymentDate, subUtcMonths } from "./receivables";
import { plural } from "./utils";

/**
 * Money page builders over invoice DTOs: totals, the collected-by-month series
 * and ledger grouping/filtering. Aging, overdue and payment-date rules live in
 * `receivables.ts`. All dates are UTC.
 */

export const OTHER_SERIES_KEY = "other";
const OTHER_SERIES_NAME = "Other accounts";
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

export function utcMonthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-06" → "Jun" (or "June" with `long`). */
export function monthLabel(key: string, long = false): string {
  const m = Number(key.slice(5, 7)) - 1;
  return (long ? MONTH_LONG : MONTH_SHORT)[m] ?? key;
}

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
  if (inv.status === "overdue") return { text: "Overdue", late: true };
  if (days === 0) return { text: "Due today", late: false };
  return { text: `Due in ${plural(-days, "day")}`, late: false };
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
