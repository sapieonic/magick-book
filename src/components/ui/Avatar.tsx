import { initials, cn } from "@/lib/utils";

/**
 * Initials disc. `tone="ink"` marks the signed-in user; everyone else is neutral.
 * Initials never drop below 12px; under 24px they switch to the condensed face
 * so two wide letters still fit the disc.
 */
export function Avatar({
  name,
  size = 28,
  tone = "neutral",
  className,
}: {
  name: string;
  size?: number;
  tone?: "neutral" | "ink";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        tone === "ink" ? "bg-ink-1 text-on-ink" : "bg-sunk text-ink-1",
        size < 24 && "font-condensed",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.4)) }}
      title={name || undefined}
      aria-hidden
    >
      {initials(name) || "?"}
    </span>
  );
}

/** Owner initials and name for table cells, or a dash when unowned. `first` shows the first name only. */
export function OwnerCell({ name, first, size = 22 }: { name: string; first?: boolean; size?: number }) {
  if (!name) return <span className="text-ink-3">–</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink-2">
      <Avatar name={name} size={size} /> {first ? name.split(" ")[0] : name}
    </span>
  );
}
