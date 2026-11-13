import { absoluteTime, ageInWords, cn, daysSince } from "@/lib/utils";

/** A record goes stale (overdue colour) after this many days without activity. */
const STALE_AFTER_DAYS = 30;

/**
 * Time since the last touch in words ("Today", "17 days", "4 months"). Turns
 * overdue red past 30 days unless `plain`. Reads "Last activity … ago" to
 * assistive tech; the absolute time is in the tooltip.
 */
export function Staleness({ since, now, plain, className }: { since: string; now?: Date; plain?: boolean; className?: string }) {
  if (!since) return null;
  const days = daysSince(since, now);
  return (
    <time dateTime={since} className={cn(className, !plain && days > STALE_AFTER_DAYS && "text-overdue")} title={`Last activity ${absoluteTime(since)}`}>
      <span className="sr-only">Last activity </span>
      {ageInWords(days)}
      {days >= 1 && <span className="sr-only"> ago</span>}
    </time>
  );
}
