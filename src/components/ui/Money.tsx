import { cn, formatINR, formatINRCompact } from "@/lib/utils";

export const MONEY_DASH = "–";

/**
 * Split an amount into sign + digits (no ₹). Returns null for zero or missing
 * values, which are shown as a dash, never a celebratory ₹0.
 */
export function moneyParts(value: number | null | undefined, compact = false): { sign: string; digits: string } | null {
  if (value == null || !Number.isFinite(value) || Math.round(value) === 0) return null;
  const formatted = (compact ? formatINRCompact : formatINR)(Math.abs(value));
  return { sign: value < 0 ? "−" : "", digits: formatted.slice(1) };
}

/** Plain-string form for aria-labels, titles and sentences: "₹4,37,096", "₹4.4L" or "–". */
export function formatMoney(value: number | null | undefined, compact = false): string {
  const parts = moneyParts(value, compact);
  return parts ? `${parts.sign}₹${parts.digits}` : MONEY_DASH;
}

/**
 * An amount in rupees with tabular figures and a muted ₹. Full en-IN grouping
 * by default (tables, statements); `compact` for lakh/thousand shorthand
 * (summaries). Zero and missing values render as a dash.
 */
export function Money({
  value,
  compact,
  className,
}: {
  value: number | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const parts = moneyParts(value, compact);
  if (!parts) return <span className={cn("text-ink-3", className)}>{MONEY_DASH}</span>;
  return (
    <span className={cn("tnum whitespace-nowrap", className)}>
      {parts.sign}
      <span className="opacity-70">₹</span>
      {parts.digits}
    </span>
  );
}
