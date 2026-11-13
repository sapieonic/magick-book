"use client";
import type { ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { StatusPill } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Misc";
import { stageColor } from "@/components/ui/stage";
import { PIPELINE_STAGES, STAGE_META, type BoardStage, type PipelineStage } from "@/lib/constants";
import { cn, shortDate } from "@/lib/utils";
import type { LeadDTO, LeadStageSpan } from "@/lib/types";
import { dateRange, durationWords, timeInStages, wholeDays, type StageTime } from "./stage-time";

type Step = "done" | "current" | "next" | "ahead";

/** The line under a stage name: time spent there, or what moving there does. */
function stageNote(step: Step, stage: PipelineStage, time: StageTime | undefined, lead: LeadDTO, locked: boolean): ReactNode {
  const since = shortDate(time?.from ?? lead.createdAt, false);
  if (step === "current") {
    if (stage !== "won") return `${durationWords(time?.ms ?? 0)} here · since ${since}`;
    return lead.convertedAccountId ? "Converted to an account" : `Since ${since}`;
  }
  if (step === "done") {
    return time ? `${durationWords(time.ms)} · ${dateRange(time.from, time.to ?? new Date().toISOString())}` : "Not recorded";
  }
  if (stage === "won") return "Converts to an account";
  if (step === "next" && !locked) return <span className="text-accent underline group-hover:text-accent-hover">Move here</span>;
  return null;
}

/**
 * The lead's signature moment: New → Won as five ramp bars, each with the time
 * the lead spent there. Clicking a stage moves the lead (Won opens the convert
 * flow). Parked and lost leads show where they left the funnel.
 */
export function StageTrack({
  lead,
  spans,
  locked,
  pending,
  onMove,
  onConvert,
}: {
  lead: LeadDTO;
  spans: LeadStageSpan[];
  /** No moves: converted, archived or not the viewer's lead. */
  locked: boolean;
  pending: BoardStage | null;
  onMove: (stage: PipelineStage) => void;
  onConvert: () => void;
}) {
  const times = timeInStages(spans);
  const at = PIPELINE_STAGES.indexOf(lead.stage as PipelineStage);
  const offRamp = at < 0;
  const current = times.get(lead.stage);

  function stepOf(i: number, stage: PipelineStage): Step {
    if (i === at) return "current";
    if (offRamp) return times.has(stage) ? "done" : "ahead";
    if (i < at) return "done";
    return i === at + 1 ? "next" : "ahead";
  }

  return (
    <Panel aria-label="Stage track">
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-5 md:gap-0.5">
        {PIPELINE_STAGES.map((stage, i) => {
          const step = stepOf(i, stage);
          const time = times.get(stage);
          const won = stage === "won";
          const stale = step === "current" && !won && !!time && wholeDays(time.ms) > 30;
          const bar = step === "current" && !won ? "var(--color-accent)" : step === "done" || step === "current" ? stageColor(stage) : undefined;
          return (
            <li key={stage}>
              <button
                type="button"
                onClick={() => (won && !lead.convertedAccountId ? onConvert() : onMove(stage))}
                disabled={locked || step === "current" || pending !== null}
                aria-current={step === "current" ? "step" : undefined}
                aria-busy={pending === stage || undefined}
                className="group block w-full rounded-bar text-left text-ink-1 enabled:cursor-pointer disabled:cursor-default"
              >
                <span aria-hidden className={cn("block h-1.5 rounded-[3px]", !bar && "bg-sunk")} style={bar ? { background: bar } : undefined} />
                <span className="block pr-3 pt-2.5">
                  <span className={cn("block text-[12px]", step === "current" ? "font-medium text-accent" : "text-ink-3")}>
                    {i + 1}
                    {step === "done" && " · done"}
                    {step === "current" && " · current stage"}
                    {step === "next" && " · next"}
                  </span>
                  <span
                    className={cn(
                      "block",
                      step === "current" ? "text-[18px] font-semibold leading-[1.25]" : "font-medium",
                      step === "ahead" && "text-ink-2",
                    )}
                  >
                    {STAGE_META[stage].label}
                  </span>
                  <span className={cn("tnum block text-[13px]", stale ? "font-medium text-overdue" : "text-ink-3")}>
                    {pending === stage ? <Spinner className="size-4" /> : stageNote(step, stage, time, lead, locked)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {offRamp && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-[13px] text-ink-2">
          <StatusPill status={lead.stage === "lost" ? "lost" : "parked"} />
          <span className="tnum">
            {current ? `${durationWords(current.ms)} · since ${shortDate(current.from)}` : `Since ${shortDate(lead.createdAt)}`}
            {lead.stage === "lost" && lead.lostReason && ` · ${lead.lostReason}`}
          </span>
          {!locked && <span>Pick a stage to bring it back into the funnel.</span>}
        </p>
      )}
    </Panel>
  );
}
