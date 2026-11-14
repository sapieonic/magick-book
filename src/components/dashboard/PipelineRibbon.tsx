import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Money, formatMoney } from "@/components/ui/Money";
import { ProportionBar, segmentShares } from "@/components/ui/ProportionBar";
import { stageColor } from "@/components/ui/stage";
import { STAGE_META, type LeadStage } from "@/lib/constants";
import { cn, plural } from "@/lib/utils";
import type { DashboardData } from "@/lib/types";

/** Each band opens the leads board focused on its stage. */
export const stageHref = (stage: LeadStage) => `/leads?stage=${stage}`;

/**
 * Signature pipeline ribbon: each stage is a band drawn to its rupee value,
 * labelled in place, with empty stages kept visible. Phones get one row per stage.
 */
export function PipelineRibbon({ data }: { data: DashboardData }) {
  const won = data.pipeline.find((p) => p.stage === "won");
  const total = data.pipeline.reduce((s, p) => s + p.value, 0);
  const segments = segmentShares(
    data.pipeline.map((p) => ({
      key: p.stage,
      label: STAGE_META[p.stage].label,
      value: p.value,
      count: p.count,
      color: stageColor(p.stage),
      href: stageHref(p.stage),
      valueClassName: p.stage === "won" ? "text-paid" : undefined,
      note: p.stage === "won" && data.wonConverted > 0 ? `converted to ${plural(data.wonConverted, "account")}` : undefined,
    })),
  );
  const largest = Math.max(...segments.map((s) => s.value));

  return (
    <Panel
      title="Pipeline"
      meta={
        <>
          {formatMoney(total, true)}
          <span className="max-md:hidden"> · each band is drawn to its rupee value</span>
        </>
      }
      actions={
        <span className="tnum">
          <span className="max-md:hidden">
            Open {formatMoney(data.openValue, true)} in {plural(data.openLeads, "lead")}
            {won && won.count > 0 && <> · Won {formatMoney(won.value, true)} in {won.count}</>}
            {" · "}
          </span>
          <Link href="/leads" className="link">
            Open board
          </Link>
        </span>
      }
    >
      <ProportionBar aria-label="Pipeline by value" emptyLabel="Empty stage" segments={segments} className="max-md:hidden" />

      <ul aria-label="Pipeline by value" className="md:hidden">
        {segments.map((s) => (
          <li key={s.key} className="border-b border-line last:border-b-0">
            <Link href={s.href!} className="grid min-h-11 grid-cols-[104px_minmax(0,1fr)_64px] items-center gap-2.5 text-ink-1">
              <span>
                {s.label} <span className="tnum text-ink-3">{s.count}</span>
              </span>
              {s.value > 0 ? (
                <span className="h-3.5 bg-hover">
                  <span className="block h-3.5 rounded-bar" style={{ width: `${Math.max(2, (s.value / largest) * 100)}%`, background: s.color }} />
                </span>
              ) : (
                <span className="text-[13px] font-medium text-due">Empty stage</span>
              )}
              <Money value={s.value} compact className={cn("text-right font-medium", s.valueClassName)} />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
