import { absoluteTime, relativeTime } from "@/lib/utils";

/**
 * Renders short relative time ("2h ago") with the full absolute timestamp
 * exposed on hover via the native title tooltip. Use everywhere a timeline,
 * audit entry, or row shows a relative time.
 */
export function Time({ value, className }: { value: string | Date; className?: string }) {
  const iso = typeof value === "string" ? value : value.toISOString();
  return (
    <time dateTime={iso} title={absoluteTime(value)} className={className}>
      {relativeTime(value)}
    </time>
  );
}
