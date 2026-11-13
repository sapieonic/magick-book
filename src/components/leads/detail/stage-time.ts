import type { LeadStage } from "@/lib/constants";
import type { LeadStageSpan } from "@/lib/types";
import { ageInWords } from "@/lib/utils";
import { shortDate } from "@/lib/dates";

const DAY = 86_400_000;

export interface StageTime {
  /** Total time spent in the stage across every visit. */
  ms: number;
  /** When the first visit began. */
  from: string;
  /** When the last visit ended; null while the lead is still there. */
  to: string | null;
}

/** Fold stage spans (oldest first) into the total time spent in each stage. */
export function timeInStages(spans: LeadStageSpan[], now: number = Date.now()): Map<LeadStage, StageTime> {
  const out = new Map<LeadStage, StageTime>();
  for (const s of spans) {
    const end = s.leftAt ? new Date(s.leftAt).getTime() : now;
    const ms = Math.max(0, end - new Date(s.enteredAt).getTime());
    const prev = out.get(s.stage);
    out.set(s.stage, { ms: (prev?.ms ?? 0) + ms, from: prev?.from ?? s.enteredAt, to: s.leftAt });
  }
  return out;
}

/** A duration in words: "Under a day", "3 days", "4 months". */
export function durationWords(ms: number): string {
  const days = Math.floor(ms / DAY);
  return days < 1 ? "Under a day" : ageInWords(days);
}

/** Whole days in a duration. */
export function wholeDays(ms: number): number {
  return Math.floor(ms / DAY);
}

/** A compact date range: "2 to 5 Jul", "28 Jun to 5 Jul", or with years when they differ from this year. */
export function dateRange(from: string, to: string, now: Date = new Date()): string {
  const a = new Date(from);
  const b = new Date(to);
  const thisYear = a.getFullYear() === now.getFullYear() && b.getFullYear() === now.getFullYear();
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return a.getDate() === b.getDate() ? shortDate(b, !thisYear) : `${a.getDate()} to ${shortDate(b, !thisYear)}`;
  }
  return `${shortDate(a, !thisYear)} to ${shortDate(b, !thisYear)}`;
}
