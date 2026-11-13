import { Avatar } from "@/components/ui/Avatar";
import { stageColor } from "@/components/ui/stage";
import { STAGE_META, type LeadStage } from "@/lib/constants";

/** Stage word with its ramp swatch (grey for parked and lost). */
export function StageLabel({ stage }: { stage: LeadStage }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="size-2 shrink-0 rounded-[2px]" style={{ background: stageColor(stage) }} aria-hidden />
      {STAGE_META[stage].label}
    </span>
  );
}

/** Owner initials and name, or a dash. */
export function OwnerCell({ name }: { name: string }) {
  if (!name) return <span className="text-ink-3">–</span>;
  return (
    <span className="inline-flex items-center gap-2 text-ink-2">
      <Avatar name={name} size={22} /> {name}
    </span>
  );
}
