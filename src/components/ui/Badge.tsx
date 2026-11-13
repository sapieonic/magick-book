import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STAGE_META, type AccountStatus, type InvoiceStatus, type LeadStage } from "@/lib/constants";
import { stageColor } from "./stage";

type Tone = "neutral" | "accent" | "paid" | "due" | "overdue" | "lost";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunk text-ink-2",
  accent: "bg-accent-tint text-accent",
  paid: "bg-paid-tint text-paid",
  due: "bg-due-tint text-due",
  overdue: "bg-overdue-tint text-overdue",
  lost: "bg-lost-tint text-lost",
};

const PILL = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent py-0.5 pl-2 pr-2.5 text-[13px] font-medium";

/** Pill chip in one of the status tones. */
export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  /** CSS colour for a leading dot. */
  dot?: string;
}) {
  return (
    <span className={cn(PILL, TONES[tone], className)}>
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

/** Lead stage word with its ramp swatch (grey for parked and lost). */
export function StageLabel({ stage }: { stage: LeadStage }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="size-2 shrink-0 rounded-[2px]" style={{ background: stageColor(stage) }} aria-hidden />
      {STAGE_META[stage].label}
    </span>
  );
}
