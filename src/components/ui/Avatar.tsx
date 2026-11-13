import { initials, cn } from "@/lib/utils";

/** Initials disc. `tone="ink"` marks the signed-in user; everyone else is neutral. */
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
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      title={name || undefined}
      aria-hidden
    >
      {initials(name) || "?"}
    </span>
  );
}
