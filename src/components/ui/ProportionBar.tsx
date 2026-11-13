import { type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Money, formatMoney } from "./Money";

export interface Segment {
  key: string;
  label: string;
  /** Rupee value the segment's width is drawn to. */
  value: number;
  /** Any CSS colour, e.g. `stageColor("new")` or `"var(--color-due-fill)"`. */
  color: string;
  /** Shown after a ribbon segment's label (e.g. number of leads). */
  count?: number;
  /** Extra caption after the percentage in a ribbon. */
  note?: ReactNode;
  /** Makes a ribbon segment a link. */
  href?: string;
  /** Class for the value figure, e.g. `"text-paid"` for Won. */
  valueClassName?: string;
}

export type SharedSegment<T extends Segment = Segment> = T & { share: number; pct: number };

/**
 * Each segment's share of the positive total: `share` in 0..1 and `pct` as a
 * whole number. Negative and non-finite values count as zero.
 */
export function segmentShares<T extends Segment>(segments: T[]): SharedSegment<T>[] {
  const clean = segments.map((s) => (Number.isFinite(s.value) && s.value > 0 ? s.value : 0));
  const total = clean.reduce((sum, v) => sum + v, 0);
  return segments.map((s, i) => {
    const share = total > 0 ? clean[i] / total : 0;
    return { ...s, value: clean[i], share, pct: Math.round(share * 100) };
  });
}

interface ProportionBarProps {
  segments: Segment[];
  /** Names the chart for assistive tech, e.g. "Pipeline by value". */
  "aria-label": string;
  /**
   * `ribbon`: labelled bands with the value written under each (pipeline).
   * `bar`: one thin joined bar, optionally with a legend (statement, aging).
   */
  variant?: "ribbon" | "bar";
  /** Ribbon density (default `md`). Bar height: `sm` 12px thin bar (default), `md` 36px block (account statement). */
  size?: "sm" | "md";
  /** Bar variant: list every segment with its swatch and amount underneath. */
  legend?: boolean;
  /** Abbreviate amounts (₹1.1L). Defaults to true for ribbons, false for legends. */
  compact?: boolean;
  /** Caption under an empty ribbon slot. */
  emptyLabel?: string;
  className?: string;
}

/** Segmented bar where width always maps to rupees; empty values stay visible as hatched slots. */
export function ProportionBar({ variant = "ribbon", ...props }: ProportionBarProps) {
  return variant === "ribbon" ? <Ribbon {...props} /> : <Bar {...props} />;
}

const RIBBON = {
  sm: { slot: "min-w-14", empty: "basis-16", bar: "h-6", value: "pt-1 text-[13px] font-semibold tnum" },
  md: { slot: "min-w-28", empty: "basis-28", bar: "h-7", value: "figure pt-2 text-[22px]" },
};

function Ribbon({ segments, size = "md", compact = true, emptyLabel = "Empty", className, ...aria }: Omit<ProportionBarProps, "variant">) {
  const sz = RIBBON[size];
  return (
    <div role="group" aria-label={aria["aria-label"]} className={cn("flex items-stretch gap-0.5 overflow-x-auto", className)}>
      {segmentShares(segments).map((s) => {
        const empty = s.value === 0;
        const body = (
          <>
            <div className="truncate pb-1.5 text-[12px] text-ink-2">
              {s.label}
              {s.count != null && <span className="tnum text-ink-3"> {s.count}</span>}
            </div>
            <div className={cn("rounded-bar", sz.bar, empty && "hatch")} style={empty ? undefined : { background: s.color }} />
            <div className={cn(sz.value, s.valueClassName)}>
              <Money value={s.value} compact={compact} />
            </div>
            <div className={cn("text-[12px]", empty ? "font-medium text-due" : "tnum text-ink-3")}>
              {empty ? emptyLabel : <>{s.pct}%{s.note && <> · {s.note}</>}</>}
            </div>
          </>
        );
        const cls = cn("block text-ink-1", empty ? cn("shrink-0 grow-0", sz.empty) : cn("basis-0", sz.slot));
        const style = empty ? undefined : { flexGrow: s.value };
        return s.href ? (
          <Link key={s.key} href={s.href} className={cn(cls, "rounded-bar")} style={style}>
            {body}
          </Link>
        ) : (
          <div key={s.key} className={cls} style={style}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

function Bar({ segments, size = "sm", legend, compact = false, className, ...aria }: Omit<ProportionBarProps, "variant">) {
  const shared = segmentShares(segments);
  const filled = shared.filter((s) => s.value > 0);
  const summary = shared.map((s) => `${s.label} ${formatMoney(s.value)}`).join(", ");
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`${aria["aria-label"]}: ${summary}`}
        className={cn("flex gap-0.5 overflow-hidden", size === "md" ? "h-9 rounded-bar" : "h-3 rounded-full", filled.length === 0 && "hatch")}
      >
        {filled.map((s) => (
          <div key={s.key} className="min-w-1.5 basis-0" style={{ flexGrow: s.value, background: s.color }} />
        ))}
      </div>
      {legend && (
        <dl className="mt-2.5 grid grid-cols-[1fr_auto] gap-y-1 text-[13px]">
          {shared.map((s) => (
            <div key={s.key} className={cn("col-span-2 grid grid-cols-subgrid", s.value === 0 && "text-ink-3")}>
              <dt className="flex items-center gap-2">
                <span
                  className={cn("size-2", s.value === 0 ? "border border-line-strong" : "rounded-[4px]")}
                  style={s.value === 0 ? undefined : { background: s.color }}
                  aria-hidden
                />
                {s.label}
              </dt>
              <dd className="text-right">
                <Money value={s.value} compact={compact} className={s.valueClassName} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
