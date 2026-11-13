import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/utils";
import { longDate, summaryPhrases } from "./format";
import type { DashboardData } from "@/lib/types";

/** Date, the one-sentence brief, and four headline counts. */
export function TodayHeader({ data }: { data: DashboardData }) {
  const stats = [
    { label: "Open leads", value: data.openLeads },
    { label: "Qualified", value: data.qualified },
    { label: "Won this month", value: data.wonThisMonth },
    { label: "Active accounts", value: data.activeAccounts },
  ];
  return (
    <Panel aria-label="Summary" className="grid items-end gap-x-10 gap-y-4 xl:grid-cols-[minmax(0,1fr)_352px]">
      <div>
        <p className="mb-2 text-[13px] text-ink-3 md:mb-2.5">{longDate(new Date(data.asOf))}</p>
        <p className="max-w-[34em] text-[22px] leading-[1.32] tracking-[-0.01em] text-ink-2 md:text-[26px]">
          {summaryPhrases(data).map((p, i) =>
            p.strong ? (
              <span key={i} className="tnum font-medium text-ink-1">
                {p.text}
              </span>
            ) : (
              p.text
            ),
          )}
        </p>
      </div>
      <dl className="grid grid-cols-2 border-t border-line-strong max-md:hidden md:grid-cols-4 xl:grid-cols-2">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "border-line py-2.5",
              i % 2 === 0 ? "pr-3 xl:border-r" : "pl-3",
              i < 2 && "xl:border-b",
              "md:max-xl:border-r md:max-xl:px-3 md:max-xl:first:pl-0 md:max-xl:last:border-r-0",
            )}
          >
            <dt className="text-[12px] text-ink-3">{s.label}</dt>
            <dd className={cn("figure text-[28px]", s.value === 0 && "text-ink-3")}>{s.value === 0 ? "–" : s.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
