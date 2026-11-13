"use client";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown } from "lucide-react";
import { CollapsedLane, SortableItem, StageLane, type CardKeyHandler } from "./BoardLane";
import { LeadCard, LeadRow } from "./LeadCard";
import { LostLeadModal } from "./LostLeadModal";
import { PHONE_QUERY, useMediaQuery } from "./useMediaQuery";
import { KbdHint } from "@/components/ui/Misc";
import { Money } from "@/components/ui/Money";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import {
  BOARD_STAGES,
  PIPELINE_STAGES,
  STAGE_META,
  isCollapsibleStage,
  type BoardStage,
  type LeadStage,
  type PipelineStage,
} from "@/lib/constants";
import { stageTotals } from "@/lib/leadFilters";
import { cn } from "@/lib/utils";
import type { LeadDTO } from "@/lib/types";

type Board = Record<BoardStage, LeadDTO[]>;

const COLLAPSE_KEY = "mb.leads.board.collapsed";
const DEFAULT_COLLAPSED = ["parked"] as const;
const DROP_PARKED = "drop:parked";
const DROP_LOST = "drop:lost";

/** Card shortcuts: 1–5 move along the funnel, P parks. (L, for lost, opens the reason dialog.) */
const KEY_STAGES: Record<string, BoardStage> = { "1": "new", "2": "contacted", "3": "qualified", "4": "proposal", "5": "won", p: "parked" };

function buildBoard(leads: LeadDTO[]): Board {
  const board = Object.fromEntries(BOARD_STAGES.map((s) => [s, [] as LeadDTO[]])) as Board;
  for (const l of leads) board[l.stage as BoardStage]?.push(l);
  for (const s of BOARD_STAGES) board[s].sort((a, b) => a.order - b.order || +new Date(a.createdAt) - +new Date(b.createdAt));
  return board;
}

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return new Set(DEFAULT_COLLAPSED);
    return new Set(parsed.filter((s): s is string => typeof s === "string" && isCollapsibleStage(s)));
  } catch {
    return new Set(DEFAULT_COLLAPSED);
  }
}

/**
 * Which collapsible lanes (Won, Parked) are folded away, remembered per browser.
 * A lane named by `?stage=` opens for this visit without changing the stored choice.
 */
function useCollapsedColumns(open?: string | null) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(DEFAULT_COLLAPSED));

  useEffect(() => {
    const stored = readCollapsed();
    if (open) stored.delete(open);
    setCollapsed(stored);
  }, [open]);

  function toggle(stage: string) {
    if (!isCollapsibleStage(stage)) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable: keep the in-memory state */
      }
      return next;
    });
  }

  return { collapsed, toggle };
}

/**
 * The pipeline board. Five funnel lanes (equal columns from 1280px, ~280px
 * scroll-snap lanes on tablets, one stage at a time on phones), a Parked/Lost
 * shelf that doubles as a drop target, and the Parked holding lane. Cards move
 * by drag and drop or, when focused, by keyboard (1–5, P, L).
 */
export function LeadBoard({
  leads,
  lostCount = 0,
  focusStage,
  onAdd,
  onChanged,
  onShowLost,
}: {
  leads: LeadDTO[];
  lostCount?: number;
  /** From `?stage=`: highlighted, scrolled into view, and opened if it was collapsed. */
  focusStage?: LeadStage | null;
  onAdd: (stage: BoardStage) => void;
  onChanged: () => void;
  onShowLost?: () => void;
}) {
  const { toast } = useToast();
  const hintId = useId();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [board, setBoard] = useState<Board>(() => buildBoard(leads));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lostLead, setLostLead] = useState<LeadDTO | null>(null);
  const [phoneStage, setPhoneStage] = useState<PipelineStage>(() =>
    focusStage && (PIPELINE_STAGES as readonly string[]).includes(focusStage) ? (focusStage as PipelineStage) : "new",
  );
  const { collapsed, toggle } = useCollapsedColumns(focusStage);
  // The card's original column, captured at drag start: `onDragOver` shuffles the
  // board mid-drag, so by `onDragEnd` the source can't be recovered from state.
  const homeStageRef = useRef<BoardStage | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => setBoard(buildBoard(leads)), [leads]);

  // Bring a `?stage=` lane into view once it has rendered (tablet scroller, parked lane below the fold).
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!focusStage || scrolledTo.current === focusStage) return;
    const lane = boardRef.current?.parentElement?.querySelector<HTMLElement>(`[data-testid="col-${focusStage}"]`);
    if (!lane) return;
    scrolledTo.current = focusStage;
    lane.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "start" });
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const activeLead = useMemo(() => leads.find((l) => l.id === activeId) ?? null, [activeId, leads]);
  const totals = useMemo(() => stageTotals(Object.values(board).flat()), [board]);

  function findStage(id: string): BoardStage | "lost" | null {
    if (id === DROP_PARKED) return "parked";
    if (id === DROP_LOST) return "lost";
    if (id.startsWith("col:")) return id.slice(4) as BoardStage;
    return BOARD_STAGES.find((s) => board[s].some((l) => l.id === id)) ?? null;
  }

  /** Move a lead to the top of another lane (keyboard, shelf and "Move here"). */
  async function move(lead: LeadDTO, to: BoardStage) {
    if (lead.stage === to && board[to].some((l) => l.id === lead.id)) return;
    setBoard((prev) => {
      const next = Object.fromEntries(BOARD_STAGES.map((s) => [s, prev[s].filter((l) => l.id !== lead.id)])) as Board;
      next[to] = [{ ...lead, stage: to, order: 0 }, ...next[to]];
      return next;
    });
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-lead-id="${lead.id}"] a`)?.focus());
    try {
      await api.patch(`/api/leads/${lead.id}/stage`, { stage: to, order: 0 });
      toast(`${lead.name} moved to ${STAGE_META[to].label}.`, "success");
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't move lead", "error");
      setBoard(buildBoard(leads));
    }
  }

  const onCardKey: CardKeyHandler = (lead: LeadDTO, e: KeyboardEvent<HTMLElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "l") {
      e.preventDefault();
      setLostLead(lead);
      return;
    }
    const to = KEY_STAGES[key];
    if (!to) return;
    e.preventDefault();
    move(lead, to);
  };

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    homeStageRef.current = findStage(id) as BoardStage | null;
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeKey = String(active.id);
    const overId = String(over.id);
    if (overId.startsWith("drop:")) return; // shelf targets act on drop, not while hovering

    const fromStage = findStage(activeKey);
    const toStage = findStage(overId);
    if (!fromStage || !toStage || fromStage === toStage || fromStage === "lost" || toStage === "lost") return;

    setBoard((prev) => {
      const lead = prev[fromStage].find((l) => l.id === activeKey);
      if (!lead) return prev;
      const targetList = prev[toStage].filter((l) => l.id !== activeKey);
      const oi = targetList.findIndex((l) => l.id === overId);
      const index = oi >= 0 ? oi : targetList.length;
      const dest = [...targetList];
      dest.splice(index, 0, { ...lead, stage: toStage });
      return { ...prev, [fromStage]: prev[fromStage].filter((l) => l.id !== activeKey), [toStage]: dest };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    const fromStage = homeStageRef.current;
    homeStageRef.current = null;
    const lead = leads.find((l) => l.id === active.id);

    // Dropped nowhere: undo any mid-drag shuffling `onDragOver` applied.
    if (!over || !fromStage || !lead) {
      setBoard(buildBoard(leads));
      return;
    }

    const overId = String(over.id);
    if (overId === DROP_LOST) {
      setBoard(buildBoard(leads));
      setLostLead(lead);
      return;
    }
    if (overId === DROP_PARKED) {
      setBoard(buildBoard(leads));
      if (fromStage !== "parked") move(lead, "parked");
      return;
    }

    // The card's current column: `onDragOver` may already have moved it cross-lane.
    const toStage = findStage(String(active.id)) as BoardStage | null;
    if (!toStage) return;
    const targetList = board[toStage].filter((l) => l.id !== active.id);
    const oi = overId.startsWith("col:") ? -1 : targetList.findIndex((l) => l.id === overId);
    const index = oi >= 0 ? oi : targetList.length;

    // No-op: dropped back in its home column at the same position.
    if (fromStage === toStage && board[toStage].findIndex((l) => l.id === active.id) === index) {
      setBoard(buildBoard(leads));
      return;
    }

    const dest = [...targetList];
    dest.splice(index, 0, { ...lead, stage: toStage });
    setBoard({ ...board, [toStage]: dest.map((l, i) => ({ ...l, order: i })) });

    try {
      await api.patch(`/api/leads/${lead.id}/stage`, { stage: toStage, order: index });
      if (fromStage !== toStage) {
        toast(`${lead.name} moved to ${STAGE_META[toStage].label}.`, "success");
        onChanged();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't move lead", "error");
      setBoard(buildBoard(leads));
    }
  }

  const laneProps = (stage: PipelineStage, i: number) => ({
    stage,
    leads: board[stage],
    total: totals[stage],
    previous: i > 0 ? { stage: PIPELINE_STAGES[i - 1], leads: board[PIPELINE_STAGES[i - 1]] } : undefined,
    activeId,
    hintId,
    focused: stage === focusStage,
    onKey: onCardKey,
    onMove: move,
    onMoreFields: () => onAdd(stage),
    onCreated: onChanged,
  });

  const columns = PIPELINE_STAGES.map((s) => (collapsed.has(s) ? "56px" : "minmax(0,1fr)")).join(" ");
  const parkedOpen = !collapsed.has("parked");

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <p id={hintId} className="sr-only">
          Press 1 to 5 to move this lead to that stage, P to park it, or L to mark it lost.
        </p>

        {isPhone ? (
          <div className="flex flex-col gap-2">
            <div className="overflow-x-auto">
              <SegmentedControl
                aria-label="Stage"
                size="sm"
                className="min-w-full"
                options={PIPELINE_STAGES.map((s) => ({ value: s, label: STAGE_META[s].label }))}
                value={phoneStage}
                onChange={setPhoneStage}
              />
            </div>
            <StageLane key={phoneStage} {...laneProps(phoneStage, PIPELINE_STAGES.indexOf(phoneStage))} dnd={false} />
          </div>
        ) : (
          <div
            ref={boardRef}
            style={{ "--board-cols": columns } as CSSProperties}
            className="flex min-h-[420px] snap-x snap-mandatory gap-3 overflow-x-auto max-xl:h-[calc(100dvh-236px)] max-xl:min-h-[520px] xl:grid xl:snap-none xl:overflow-visible xl:[grid-template-columns:var(--board-cols)]"
          >
            {PIPELINE_STAGES.map((stage, i) =>
              collapsed.has(stage) ? (
                <CollapsedLane key={stage} stage={stage} count={board[stage].length} onExpand={() => toggle(stage)} className="w-14 shrink-0 xl:w-auto" />
              ) : (
                <StageLane
                  key={stage}
                  {...laneProps(stage, i)}
                  dnd
                  onCollapse={isCollapsibleStage(stage) ? () => toggle(stage) : undefined}
                  className="w-[280px] shrink-0 snap-start max-xl:overflow-y-auto xl:w-auto"
                />
              ),
            )}
          </div>
        )}

        <DropShelf
          dragging={activeId != null}
          parkedCount={board.parked.length}
          parkedOpen={parkedOpen}
          lostCount={lostCount}
          onToggleParked={() => toggle("parked")}
          onShowLost={onShowLost}
        />

        {parkedOpen && <ParkedLane leads={board.parked} activeId={activeId} hintId={hintId} focused={focusStage === "parked"} onKey={onCardKey} onCollapse={() => toggle("parked")} />}

        <DragOverlay>
          {activeLead && (
            <div className="w-[260px]">
              {activeLead.stage === "won" ? (
                <div className="glass-card rounded-card px-3 shadow-pop [&>*]:border-b-0">
                  <LeadRow lead={activeLead} dragging />
                </div>
              ) : (
                <LeadCard lead={activeLead} dragging />
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <LostLeadModal lead={lostLead} onClose={() => setLostLead(null)} onDone={onChanged} />
    </>
  );
}

/** A dashed shelf target that is also a button (Parked toggles its lane; Lost opens the Lost view). */
function ShelfTarget({
  id,
  label,
  count,
  onClick,
  expanded,
}: {
  id: string;
  label: string;
  count: number;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={cn(
        "flex h-9 items-center gap-2 rounded-control border border-dashed border-line-strong px-3.5 text-[13px] text-ink-2 transition-colors hover:bg-hover",
        isOver && "border-solid border-accent bg-accent-tint text-accent",
      )}
    >
      {label} <span className="tnum font-semibold text-ink-1">{count}</span>
      {expanded != null && <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} strokeWidth={1.5} aria-hidden />}
    </button>
  );
}

/** Parked and Lost, below the board. While a card is dragged it sticks to the bottom of the view. */
function DropShelf({
  dragging,
  parkedCount,
  parkedOpen,
  lostCount,
  onToggleParked,
  onShowLost,
}: {
  dragging: boolean;
  parkedCount: number;
  parkedOpen: boolean;
  lostCount: number;
  onToggleParked: () => void;
  onShowLost?: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Parked and lost"
      className={cn(
        "glass flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-panel px-4 py-3",
        dragging && "sticky bottom-3 z-20 animate-rise shadow-pop",
      )}
    >
      <ShelfTarget id={DROP_PARKED} label="Parked" count={parkedCount} onClick={onToggleParked} expanded={parkedOpen} />
      <ShelfTarget id={DROP_LOST} label="Lost" count={lostCount} onClick={onShowLost} />
      <span className="text-[13px] text-ink-3 max-md:hidden">
        {dragging ? "Drop the card on Parked or Lost." : "Drag a card here to park it or mark it lost."}
      </span>
      <span className="flex-1" />
      <span className="text-[12px] text-ink-3 max-md:hidden">
        Keys: <KbdHint>1</KbdHint>–<KbdHint>5</KbdHint> move stage · <KbdHint>L</KbdHint> lost · <KbdHint>P</KbdHint> park ·{" "}
        <KbdHint>Enter</KbdHint> open
      </span>
    </div>
  );
}

/** The holding lane: parked leads sit outside the funnel and its totals until picked back up. */
function ParkedLane({
  leads,
  activeId,
  hintId,
  focused,
  onKey,
  onCollapse,
}: {
  leads: LeadDTO[];
  activeId: string | null;
  hintId: string;
  focused: boolean;
  onKey: CardKeyHandler;
  onCollapse: () => void;
}) {
  const headingId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: "col:parked" });
  const value = leads.reduce((sum, l) => sum + Math.max(0, l.estValue), 0);
  return (
    <section
      aria-labelledby={headingId}
      data-testid="col-parked"
      data-collapsed="false"
      className={cn("glass-lane rounded-panel p-2.5", focused && "outline-2 outline-offset-2 outline-accent")}
    >
      <div className="flex items-baseline justify-between gap-2 px-1.5 pb-2.5 pt-1.5">
        <h2 id={headingId} className="text-[14px] font-semibold">
          Parked <span className="tnum font-normal text-ink-3">{leads.length}</span>
        </h2>
        <span className="flex items-center gap-2">
          <Money value={value} compact className="figure text-[16px] text-ink-2" />
          <button
            type="button"
            onClick={onCollapse}
            aria-expanded
            aria-label="Collapse Parked"
            className="grid size-7 place-items-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink-1"
          >
            <ChevronDown className="size-4 rotate-180" strokeWidth={1.5} aria-hidden />
          </button>
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn("grid min-h-16 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 rounded-card transition-colors", isOver && "bg-hover")}
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={rectSortingStrategy}>
          {leads.map((lead) => (
            <SortableItem key={lead.id} lead={lead} faded={activeId === lead.id} onKey={onKey}>
              <LeadCard lead={lead} describedBy={hintId} />
            </SortableItem>
          ))}
        </SortableContext>
        {leads.length === 0 && <p className="col-span-full self-center px-1.5 text-[13px] text-ink-3">Nothing parked. Park a lead to set it aside without losing it.</p>}
      </div>
    </section>
  );
}
