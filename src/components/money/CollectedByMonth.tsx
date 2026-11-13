import { Panel } from "@/components/ui/Panel";
import { Money, formatMoney } from "@/components/ui/Money";
import { OTHER_SERIES_KEY, monthLabel } from "@/lib/money-charts";
import { cn } from "@/lib/utils";
import type { CollectedDTO } from "@/lib/types";

/** Top account, second account, then grey "Other". Checked for colour-blind separation in both themes. */
const SERIES_CLASS = ["bg-stage-4", "bg-stage-2"];
const OTHER_CLASS = "bg-lost dark:bg-lost-fill";
const PLOT_HEIGHT = 128;
/** One account bringing in this share of collections earns a note. */
const CONCENTRATION = 0.6;

/** "June to November 2026", or "December 2025 to May 2026" across a year end. */
function periodLabel(from?: string, to?: string): string {
  if (!from || !to) return "";
  const year = (key: string) => key.slice(0, 4);
  const start = monthLabel(from, true) + (year(from) === year(to) ? "" : ` ${year(from)}`);
  return `${start} to ${monthLabel(to, true)} ${year(to)}`;
}

const seriesClass = (key: string, i: number) => (key === OTHER_SERIES_KEY ? OTHER_CLASS : SERIES_CLASS[i]);

/** Paid by month for the last six months, stacked by the top two accounts plus Other. */
export function CollectedByMonth({ collected, className }: { collected: CollectedDTO; className?: string }) {
  const { months, series, total } = collected;
  const period = periodLabel(months[0]?.key, months[months.length - 1]?.key);
  const max = Math.max(...months.map((m) => m.total), 0);
  const shares = series.map((s, i) => ({ ...s, swatch: seriesClass(s.key, i), share: total > 0 ? s.total / total : 0 }));
  const lead = shares[0];

  return (
    <Panel title="Collected by month" className={className}>
      <p className="-mt-2 mb-4 text-[13px] text-ink-3">
        {period}
        {total > 0 && <> · {formatMoney(total, true)} in total</>}
      </p>
      {total === 0 ? (
        <p className="rounded-card bg-hover px-4 py-10 text-center text-[13px] text-ink-2">No payments in the last six months.</p>
      ) : (
        <>
          <div role="group" aria-label="Collected per month" className="grid grid-cols-6 items-end gap-2.5 border-b border-ink-1">
            {months.map((m, mi) => {
              const isLast = mi === months.length - 1;
              const breakdown = series
                .map((s, i) => (m.amounts[i] > 0 ? `${s.name} ${formatMoney(m.amounts[i])}` : null))
                .filter(Boolean)
                .join(", ");
              return (
                <div
                  key={m.key}
                  role="img"
                  tabIndex={0}
                  aria-label={`${monthLabel(m.key, true)}: ${formatMoney(m.total)}${breakdown ? ` (${breakdown})` : ""}`}
                  className="group relative flex flex-col justify-end rounded-t-bar"
                  style={{ height: PLOT_HEIGHT + 22 }}
                >
                  <span aria-hidden className={cn("tnum pb-1 text-center text-[12px]", isLast ? "font-semibold text-ink-1" : "text-ink-2")}>
                    {formatMoney(m.total, true).replace("₹", "")}
                  </span>
                  <div aria-hidden className="flex flex-col-reverse gap-[2px] overflow-hidden rounded-t-bar">
                    {m.amounts.map((amount, i) =>
                      amount > 0 ? (
                        <div
                          key={series[i].key}
                          className={seriesClass(series[i].key, i)}
                          style={{ height: Math.max(2, (amount / max) * PLOT_HEIGHT) }}
                        />
                      ) : null,
                    )}
                  </div>
                  <MonthTooltip
                    title={`${monthLabel(m.key, true)} ${m.key.slice(0, 4)}`}
                    rows={series.map((s, i) => ({ key: s.key, name: s.name, amount: m.amounts[i], swatch: seriesClass(s.key, i) }))}
                    total={m.total}
                    alignRight={mi >= months.length - 2}
                  />
                </div>
              );
            })}
          </div>
          <div aria-hidden className="grid grid-cols-6 gap-2.5 pt-1.5 text-center text-[12px] text-ink-3">
            {months.map((m, mi) => (
              <span key={m.key} className={cn(mi === months.length - 1 && "font-medium text-ink-1")}>
                {monthLabel(m.key)}
              </span>
            ))}
          </div>

          <h3 className="mt-5 border-b border-line-strong pb-1.5 text-[13px] font-semibold text-ink-1">Who paid</h3>
          <ul>
            {shares.map((s) => (
              <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-x-3.5 border-b border-line py-[9px] last:border-b-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", s.swatch)} />
                  <span className="truncate">{s.name}</span>
                </span>
                <Money value={s.total} className="text-right" />
                <span className="tnum text-right text-[13px] text-ink-3">{Math.round(s.share * 100)}%</span>
              </li>
            ))}
          </ul>
          {lead && shares.length > 1 && lead.share >= CONCENTRATION && lead.key !== OTHER_SERIES_KEY && (
            <p className="mt-3 text-[13px] text-due">
              {lead.name} brings in {Math.round(lead.share * 100)}% of collections. Worth watching.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

function MonthTooltip({
  title,
  rows,
  total,
  alignRight,
}: {
  title: string;
  rows: { key: string; name: string; amount: number; swatch: string }[];
  total: number;
  alignRight: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max min-w-[180px] rounded-control border border-line-strong bg-surface px-3 py-2 text-[12px] shadow-pop group-hover:block group-focus-visible:block",
        alignRight ? "right-0" : "left-0",
      )}
    >
      <p className="font-semibold text-ink-1">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-4 text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", r.swatch)} />
              {r.name}
            </span>
            <Money value={r.amount} />
          </li>
        ))}
      </ul>
      <p className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-semibold text-ink-1">
        <span>Total</span>
        <Money value={total} />
      </p>
    </div>
  );
}
