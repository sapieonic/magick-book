"use client";
import { type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
}

/** Single-choice switch (radio group semantics; arrow keys move the selection). */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ...aria
}: {
  options: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: "sm" | "md";
  className?: string;
  "aria-label": string;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + step + options.length) % options.length];
    onChange(next.value);
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      onKeyDown={onKeyDown}
      className={cn("inline-flex items-center gap-0.5 rounded-control bg-sunk p-0.5", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 font-medium transition-colors",
              size === "sm" ? "h-6 text-[12px]" : "h-[30px] text-[13px]",
              active ? "glass-card text-ink-1" : "border border-transparent text-ink-2 hover:text-ink-1",
            )}
          >
            {o.icon && <o.icon className="size-4" strokeWidth={1.5} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
