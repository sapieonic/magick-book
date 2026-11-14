"use client";
import { LinkButton } from "@/components/ui/Button";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { LeadCard, LeadRow } from "./LeadCard";
import { QuickAddLead } from "./QuickAddLead";
import { Money, formatMoney } from "@/components/ui/Money";
import { stageColor, stageStep } from "@/components/ui/stage";
import { STAGE_META, type PipelineStage } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { StageTotal } from "@/lib/leadFilters";
import type { LeadDTO } from "@/lib/types";

/** Cards shown per column before a "N more" toggle. */
const CARD_LIMIT = 6;

/** What moving a lead into an empty stage means, for its empty state. */
const MOVE_HINT: Partial<Record<PipelineStage, string>> = {
  contacted: "Reach out to move them here.",
  qualified: "Qualify them to move them here.",
  proposal: "Send a proposal to move them here.",
  won: "Close a proposal to move it here.",
};

export type CardKeyHandler = (lead: LeadDTO, e: KeyboardEvent<HTMLElement>) => void;

/** The header's weight rule: a hairline track filled to the stage's share of pipeline value. */
export function WeightRule({ stage, share }: { stage: PipelineStage; share: number }) {
  const pct = Math.round(share * 100);
  return (
    <div role="img" aria-label={`${pct}% of pipeline value`} className="mt-2 h-[3px] rounded-full bg-sunk">
      {share > 0 && <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: stageColor(stage) }} />}
    </div>
  );
}

function LaneHeader({ stage, total, headingId, action }: { stage: PipelineStage; total: StageTotal; headingId: string; action?: ReactNode }) {
  return (
    <div className="px-4 pb-3 pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={headingId} className="min-w-0 truncate text-[14px] font-semibold">
          <span className="font-normal text-ink-3">{stageStep(stage)}</span>&nbsp; {STAGE_META[stage].label}{" "}
          <span className="tnum font-normal text-ink-3">{total.count}</span>
        </h2>
        <span className="flex shrink-0 items-center gap-1">
          <Money value={total.value} compact className={cn("figure text-[16px]", stage === "won" && "text-paid")} />
          {action}
        </span>
      </div>
      <WeightRule stage={stage} share={total.share} />
    </div>
  );
}

/**
 * A draggable card. The link inside takes focus; the wrapper reads the move
 * shortcuts. On touch, `manipulation` keeps swipes scrolling the lanes while a
 * press and hold picks the card up (no text selection or link callout in the way).
 */
export function SortableItem({ lead, faded, onKey, children }: { lead: LeadDTO; faded: boolean; onKey: CardKeyHandler; children: ReactNode }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      data-lead-id={lead.id}
      onKeyDown={(e) => onKey(lead, e)}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: faded || isDragging ? 0.35 : 1 }}
      className="cursor-grab touch-manipulation select-none active:cursor-grabbing [-webkit-touch-callout:none]"
    >
      {children}
    </div>
  );
}

/** Lists the previous stage's leads, biggest first, each one click from moving here. */
function EmptyStage({
  stage,
  previous,
  onMove,
}: {
  stage: PipelineStage;
  previous?: { stage: PipelineStage; leads: LeadDTO[] };
  onMove: (lead: LeadDTO) => void;
}) {
  const label = STAGE_META[stage].label;
  const title = stage === "new" ? "No new leads" : stage === "won" ? "Nothing won yet" : `Nothing in ${label.toLowerCase()}`;
  const waiting = previous ? [...previous.leads].sort((a, b) => b.estValue - a.estValue) : [];

  if (!previous || waiting.length === 0) {
    return (
      <div className="px-2 pb-1 pt-3">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-[13px] text-ink-2">
          {previous ? `${STAGE_META[previous.stage].label} is empty too.` : "Add one below, or use New in the top bar."}
        </p>
      </div>
    );
  }

  const worth = waiting.reduce((sum, l) => sum + Math.max(0, l.estValue), 0);
  const n = waiting.length;
  return (
    <div className="px-2 pb-1 pt-3">
      <p className="font-semibold">{title}</p>
      <p className="mb-3.5 mt-1 text-[13px] text-ink-2">
        <span className="tnum">{n}</span> {STAGE_META[previous.stage].label.toLowerCase()} {n === 1 ? "lead" : "leads"}
        {worth > 0 && (
          <>
            {" "}worth <span className="tnum">{formatMoney(worth, true)}</span>
          </>
        )}{" "}
        {n === 1 ? "is" : "are"} waiting. {MOVE_HINT[stage]}
      </p>
      <ul className="border-t border-line-strong text-[13px]">
        {waiting.slice(0, 4).map((l) => (
          <li key={l.id} className="flex items-baseline justify-between gap-2 border-b border-line py-2">
            <span className="min-w-0 truncate">
              {l.name} <Money value={l.estValue} compact className="text-ink-3" />
            </span>
            <LinkButton onClick={() => onMove(l)} className="shrink-0" aria-label={`Move ${l.name} to ${label}`}>
              Move here
            </LinkButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function moreLabel(hidden: LeadDTO[]) {
  const value = hidden.reduce((sum, l) => sum + Math.max(0, l.estValue), 0);
  const n = hidden.length;
  return value > 0 ? `${n} more · ${formatMoney(value, true)}` : `${n} more without a value`;
}

/**
 * One funnel column on `.glass-lane`: header with step, count, value and weight
 * rule; cards (compact rows for Won); an empty state that offers the previous
 * stage's leads; and the inline quick-add. With `dnd` the cards are sortable
 * and the body is a drop target; without it (the phone list) they are plain.
 */
export function StageLane({
  stage,
  leads,
  total,
  previous,
  dnd,
  focused,
  activeId,
  hintId,
  onKey,
  onMove,
  onCollapse,
  onMoreFields,
  onCreated,
  className,
}: {
  stage: PipelineStage;
  leads: LeadDTO[];
  total: StageTotal;
  previous?: { stage: PipelineStage; leads: LeadDTO[] };
  dnd: boolean;
  focused?: boolean;
  activeId: string | null;
  hintId: string;
  onKey: CardKeyHandler;
  onMove: (lead: LeadDTO, stage: PipelineStage) => void;
  onCollapse?: () => void;
  onMoreFields: () => void;
  onCreated: (lead: LeadDTO) => void;
  className?: string;
}) {
  const headingId = useId();
  const label = STAGE_META[stage].label;
  const [showAll, setShowAll] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: dnd ? `col:${stage}` : `list:${stage}`, disabled: !dnd });
  const visible = showAll ? leads : leads.slice(0, CARD_LIMIT);
  const hidden = leads.slice(visible.length);
  const won = stage === "won";

  const items = visible.map((lead) => {
    const Item = won ? LeadRow : LeadCard;
    const card = <Item lead={lead} describedBy={dnd ? hintId : undefined} />;
    return dnd ? (
      <SortableItem key={lead.id} lead={lead} faded={activeId === lead.id} onKey={onKey}>
        {card}
      </SortableItem>
    ) : (
      <div key={lead.id}>{card}</div>
    );
  });

  return (
    <section
      aria-labelledby={headingId}
      data-testid={`col-${stage}`}
      data-collapsed="false"
      data-focused={focused || undefined}
      className={cn("glass-lane flex min-w-0 flex-col rounded-panel", focused && "outline-2 outline-offset-2 outline-accent", className)}
    >
      <div className="max-xl:sticky max-xl:top-0 max-xl:z-[1] max-xl:rounded-t-panel max-xl:bg-surface max-md:static max-md:bg-transparent">
        <LaneHeader
          stage={stage}
          total={total}
          headingId={headingId}
          action={
            onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                aria-expanded
                aria-label={`Collapse ${label}`}
                className="-my-1.5 -mr-1.5 grid size-7 place-items-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink-1"
              >
                <ChevronsRight className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
            )
          }
        />
      </div>
      <div ref={setNodeRef} className={cn("flex flex-1 flex-col gap-2 rounded-b-panel px-2.5 pb-2.5 transition-colors", isOver && "bg-hover")}>
        <SortableContext items={dnd ? visible.map((l) => l.id) : []} strategy={verticalListSortingStrategy}>
          {won && items.length > 0 ? <div className="glass-card rounded-card px-3 [&>*:last-child>*]:border-b-0">{items}</div> : items}
        </SortableContext>
        {leads.length > CARD_LIMIT && (
          <button type="button" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll} className="self-start px-1 py-1 text-left text-[13px] text-ink-2 hover:text-ink-1">
            <span className="tnum">{showAll ? "Show fewer" : moreLabel(hidden)}</span>
          </button>
        )}
        {leads.length === 0 && <EmptyStage stage={stage} previous={previous} onMove={(l) => onMove(l, stage)} />}
        {won && leads.length > 0 && <p className="px-1 text-[12px] text-ink-3">Won leads become accounts. Contacts and history carry over.</p>}
        <QuickAddLead stage={stage} onCreated={onCreated} onMoreFields={onMoreFields} />
      </div>
    </section>
  );
}

/** A collapsed column: a slim rail that still accepts drops. */
export function CollapsedLane({ stage, count, onExpand, className }: { stage: PipelineStage; count: number; onExpand: () => void; className?: string }) {
  const label = STAGE_META[stage].label;
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage}` });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      data-testid={`col-${stage}`}
      data-collapsed="true"
      className={cn("glass-lane flex flex-col items-center gap-3 rounded-panel py-3 transition-colors", isOver && "bg-hover", className)}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-expanded={false}
        aria-label={`Expand ${label}`}
        className="grid size-8 place-items-center rounded-control text-ink-2 transition-colors hover:bg-hover hover:text-ink-1"
      >
        <ChevronsLeft className="size-4" strokeWidth={1.5} aria-hidden />
      </button>
      <span className="rotate-180 font-semibold [writing-mode:vertical-rl]">{label}</span>
      <span className="tnum text-[13px] text-ink-3">{count}</span>
    </section>
  );
}
