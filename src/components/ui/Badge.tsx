import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AccountStatus, InvoiceStatus, LeadStage } from "@/lib/constants";

export type Tone = "neutral" | "accent" | "paid" | "due" | "overdue" | "lost";
/** Pre-Daybook tone names still passed by pages that have not been rebuilt. */
type LegacyTone = "violet" | "success" | "warn" | "danger" | "info";

const LEGACY_TONES: Record<LegacyTone, Tone> = {
  violet: "accent",
  info: "accent",
  success: "paid",
  warn: "due",
  danger: "overdue",
};

const TONES: Record<Tone, string> = {
  neutral: "bg-sunk text-ink-2",
  accent: "bg-accent-tint text-accent",
  paid: "bg-paid-tint text-paid",
  due: "bg-due-tint text-due",
  overdue: "bg-overdue-tint text-overdue",
  lost: "bg-lost-tint text-lost",
};

const PILL = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent py-0.5 pl-2 pr-2.5 text-[13px] font-medium";

/** Pill chip. Use `tone`, or pass a `tint` class string (bg + text) for one-off colours. */
export function Badge({
  children,
  tint,
  tone = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  tint?: string;
  tone?: Tone | LegacyTone;
  className?: string;
  /** CSS colour for a leading dot. */
  dot?: string;
}) {
  const resolved = tone in LEGACY_TONES ? LEGACY_TONES[tone as LegacyTone] : (tone as Tone);
  return (
    <span className={cn(PILL, tint ?? TONES[resolved], className)}>
      {dot && <span className="size-[7px] rounded-full" style={{ background: dot }} aria-hidden />}
      {children}
    </span>
  );
}

/** Square-cornered outline label for categories and tags, e.g. `collections`. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-bar border border-line-strong px-1.5 py-px text-[12px] text-ink-2", className)}>
      {children}
    </span>
  );
}

export type StatusTone = "paid" | "due" | "overdue" | "lost";

/** Status never relies on colour alone: each tone carries its own shape. */
const SHAPES: Record<StatusTone, string> = {
  paid: "size-[7px] rounded-full bg-paid-fill",
  due: "size-[7px] rounded-full border-[1.5px] border-due",
  overdue: "size-[7px] bg-overdue-fill",
  lost: "h-0.5 w-2 bg-lost",
};

export type DomainStatus = InvoiceStatus | AccountStatus | Extract<LeadStage, "won" | "lost" | "parked">;

export const STATUS_META: Record<DomainStatus, { label: string; tone: StatusTone }> = {
  paid: { label: "Paid", tone: "paid" },
  sent: { label: "Sent", tone: "due" },
  overdue: { label: "Overdue", tone: "overdue" },
  draft: { label: "Draft", tone: "lost" },
  active: { label: "Active", tone: "paid" },
  at_risk: { label: "At risk", tone: "due" },
  churned: { label: "Churned", tone: "overdue" },
  won: { label: "Won", tone: "paid" },
  lost: { label: "Lost", tone: "lost" },
  parked: { label: "Parked", tone: "lost" },
};

/**
 * Status chip: word + shape + colour (dot = paid, ring = sent, square = overdue,
 * dash = lost). Pass a domain `status` for the standard label, or a `tone` with
 * your own children.
 */
export function StatusPill({
  status,
  tone,
  children,
  className,
}: {
  status?: DomainStatus;
  tone?: StatusTone;
  children?: ReactNode;
  className?: string;
}) {
  const meta = status ? STATUS_META[status] : undefined;
  const resolved = tone ?? meta?.tone ?? "lost";
  return (
    <span className={cn(PILL, TONES[resolved], className)}>
      <span className={cn("shrink-0", SHAPES[resolved])} aria-hidden />
      {children ?? meta?.label}
    </span>
  );
}
