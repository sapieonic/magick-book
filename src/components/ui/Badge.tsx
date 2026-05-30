import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Pill badge. Pass a tint class string (bg + text + border) or use `tone`. */
export function Badge({
  children,
  tint,
  tone,
  className,
  dot,
}: {
  children: ReactNode;
  tint?: string;
  tone?: "neutral" | "violet" | "success" | "warn" | "danger" | "info";
  className?: string;
  dot?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-line text-ink-soft border-line-strong",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    success: "bg-success-bg text-success border-success/30",
    warn: "bg-warn-bg text-warn border-warn/40",
    danger: "bg-danger-bg text-danger border-danger/30",
    info: "bg-info-bg text-info border-info/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[11.5px] font-semibold leading-none",
        tint ?? tones[tone ?? "neutral"],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}
