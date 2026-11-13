import { PIPELINE_STAGES, type LeadStage, type PipelineStage } from "@/lib/constants";

/** The 5-step stage ramp (New → Won) as CSS colours, in pipeline order. */
export const STAGE_RAMP = PIPELINE_STAGES.map((_, i) => `var(--color-stage-${i + 1})`);

/** 1-based position of a pipeline stage on the ramp; 0 for parked / lost. */
export function stageStep(stage: LeadStage): number {
  return PIPELINE_STAGES.indexOf(stage as PipelineStage) + 1;
}

/** Fill colour for a stage: its ramp step, or the grey "lost / parked" fill off the ramp. */
export function stageColor(stage: LeadStage): string {
  const step = stageStep(stage);
  return step ? STAGE_RAMP[step - 1] : "var(--color-lost-fill)";
}
