"use client";
import { type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface TabItem<K extends string = string> {
  key: K;
  label: ReactNode;
  count?: number;
  /** Route tabs: render a link instead of a button. */
  href?: string;
}

const tabClass = (active: boolean) =>
  cn(
    "-mb-px whitespace-nowrap border-b-2 pb-2.5 transition-colors",
    active ? "border-ink-1 font-semibold text-ink-1" : "border-transparent text-ink-2 hover:text-ink-1",
  );

/**
 * Underline tabs. Give every item an `href` for route tabs (links, the active
 * one marked `aria-current`), or omit it and pass `onChange` for state tabs
 * (tablist semantics, arrow keys move between tabs).
 */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  className,
  ...aria
}: {
  tabs: TabItem<K>[];
  value: K;
  onChange?: (key: K) => void;
  className?: string;
  "aria-label": string;
}) {
  const routed = tabs.every((t) => t.href);
  const label = (t: TabItem<K>) => (
    <>
      {t.label}
      {t.count != null && (
        <>
          {" "}
          <span className="tnum font-normal text-ink-3">{t.count}</span>
        </>
      )}
    </>
  );

  if (routed) {
    return (
      <nav aria-label={aria["aria-label"]} className={cn("flex gap-6 overflow-x-auto border-b border-line-strong", className)}>
        {tabs.map((t) => (
          <Link key={t.key} href={t.href!} aria-current={t.key === value ? "page" : undefined} className={tabClass(t.key === value)}>
            {label(t)}
          </Link>
        ))}
      </nav>
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.key === value);
    const next = tabs[(i + step + tabs.length) % tabs.length];
    onChange?.(next.key);
    e.currentTarget.querySelector<HTMLElement>(`[data-key="${next.key}"]`)?.focus();
  }

  return (
    <div role="tablist" aria-label={aria["aria-label"]} onKeyDown={onKeyDown} className={cn("flex gap-6 overflow-x-auto border-b border-line-strong", className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === value}
          tabIndex={t.key === value ? 0 : -1}
          data-key={t.key}
          onClick={() => onChange?.(t.key)}
          className={tabClass(t.key === value)}
        >
          {label(t)}
        </button>
      ))}
    </div>
  );
}
