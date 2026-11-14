import type { AccountFinance } from "@/lib/types";

/**
 * The margin Money and the account both show: billed less costs, and that as
 * a share of billed ("75%", "−12%"). Negative when costs run ahead of billing
 * (shown in the overdue tone); `pct` is null while nothing is billed.
 */
export function marginFigures({ billed, expenses, margin }: Pick<AccountFinance, "billed" | "expenses" | "margin">) {
  const amount = billed - expenses;
  const pct = Math.round(margin * 100);
  return { amount, pct: billed > 0 ? `${pct < 0 ? "−" : ""}${Math.abs(pct)}%` : null, negative: amount < 0 };
}
