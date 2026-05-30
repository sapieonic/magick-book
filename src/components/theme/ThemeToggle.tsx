"use client";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type ThemePref } from "./ThemeProvider";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

/** Segmented Light / Dark / Auto control, used in the user menu & mobile sheet. */
export function ThemeToggle({ className }: { className?: string }) {
  const { pref, setPref } = useTheme();
  return (
    <div className={cn("flex items-center gap-1 rounded-[var(--radius-sm)] border border-line bg-canvas p-0.5", className)}>
      {OPTIONS.map((o) => {
        const active = pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setPref(o.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1.5 text-[12px] font-semibold transition-all",
              active ? "bg-paper text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink",
            )}
          >
            <o.icon className="size-3.5" /> {o.label}
          </button>
        );
      })}
    </div>
  );
}
