"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref, type RefObject } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown } from "lucide-react";
import { CollapsedLane, SortableItem, StageLane, WeightRule, type CardKeyHandler } from "./BoardLane";
import { LeadCard, LeadRow } from "./LeadCard";
import { LostLeadModal } from "./LostLeadModal";
import { PHONE_QUERY, useMediaQuery } from "@/lib/useMediaQuery";
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
import { byLaneOrder, laneNeighbours, stageTotals, type StageTotal } from "@/lib/leadFilters";
import { stageStep } from "@/components/ui/stage";
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
  for (const s of BOARD_STAGES) board[s].sort(byLaneOrder);
  return board;
}

/** The board with one card taken out, wherever it was. */
function without(board: Board, id: string): Board {
  return Object.fromEntries(BOARD_STAGES.map((s) => [s, board[s].filter((l) => l.id !== id)])) as Board;
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
 * by drag and drop or, when focused, by keyboard (1–5, P, L). Every move goes
 * through `api`, whose change event reloads the page's leads, so the board
 * takes no refresh callback of its own.
 */
export function LeadBoard({
  leads,
  lostCount = 0,
  focusStage,
  onAdd,
  onShowLost,
}: {
  leads: LeadDTO[];
  lostCount?: number;
  /** From `?stage=`: highlighted, scrolled into view, and opened if it was collapsed. */
  focusStage?: LeadStage | null;
  onAdd: (stage: BoardStage) => void;
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
  const shelfRef = useRef<HTMLDivElement>(null);
  // Multi-container drag state (dnd-kit's pattern): the last target the pointer
  // resolved to, and whether the card has just jumped lanes. Right after a jump
  // the lanes re-measure, and resolving afresh would bounce the card back.
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  // Server data replaces the board, except mid-drag: every mutation anywhere
  // reloads the leads, and rebuilding then would yank the card from the pointer.
  // The drop (or cancel) rebuilds from the latest leads.
  useEffect(() => {
    if (!homeStageRef.current) setBoard(buildBoard(leads));
  }, [leads]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [board]);

  // Bring a `?stage=` lane into view once it has rendered (tablet scroller, parked lane below the fold).
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!focusStage || scrolledTo.current === focusStage) return;
    const lane = boardRef.current?.parentElement?.querySelector<HTMLElement>(`[data-testid="col-${focusStage}"]`);
    if (!lane) return;
    scrolledTo.current = focusStage;
    lane.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "start" });
  });

  // Mouse drags after a small nudge; touch needs a press and hold, so a swipe still scrolls the lanes.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );
  const activeLead = useMemo(() => leads.find((l) => l.id === activeId) ?? null, [activeId, leads]);
  const totals = useMemo(() => stageTotals(Object.values(board).flat()), [board]);

  /**
   * The Parked/Lost shelf under the pointer, else the pointer's lane, else
   * whatever the card overlaps, else the last target. Over a lane with cards,
   * the nearest card wins so the drop lands between cards rather than at the end.
   */
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      // The shelf sticks to the viewport while dragging, so hit-test its live
      // position: dnd-kit's cached rects assume targets scroll with the page.
      const at = args.pointerCoordinates;
      const shelf =
        at &&
        [...(shelfRef.current?.querySelectorAll<HTMLElement>("[data-shelf]") ?? [])].find((el) => {
          const r = el.getBoundingClientRect();
          return at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom;
        });
      if (shelf) return [{ id: shelf.dataset.shelf! }];

      const pointer = pointerWithin(args);
      let overId = getFirstCollision(pointer.length > 0 ? pointer : rectIntersection(args), "id");
      if (overId != null) {
        const lane = String(overId).startsWith("col:") ? board[String(overId).slice(4) as BoardStage] : null;
        if (lane?.length) {
          const cards = new Set<UniqueIdentifier>(lane.map((l) => l.id));
          overId = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => cards.has(c.id)) })[0]?.id ?? overId;
        }
        lastOverId.current = overId;
        return [{ id: overId }];
      }
      if (recentlyMovedToNewContainer.current) lastOverId.current = activeId;
      return lastOverId.current != null ? [{ id: lastOverId.current }] : [];
    },
    [activeId, board],
  );

  function stageIn(b: Board, id: string): BoardStage | "lost" | null {
    if (id === DROP_PARKED) return "parked";
    if (id === DROP_LOST) return "lost";
    if (id.startsWith("col:")) return id.slice(4) as BoardStage;
    return BOARD_STAGES.find((s) => b[s].some((l) => l.id === id)) ?? null;
  }
  const findStage = (id: string) => stageIn(board, id);

  // Optimistic edits until the reload lands: a new card takes its lane slot, a lost one leaves the board.
  const show = (lead: LeadDTO) => setBoard((prev) => ({ ...prev, [lead.stage]: [...(prev[lead.stage as BoardStage] ?? []), lead].sort(byLaneOrder) }));
  const hide = (id: string) => setBoard((prev) => without(prev, id));

  /** Move a lead to the top of another lane (keyboard, shelf and "Move here"). */
  async function move(lead: LeadDTO, to: BoardStage) {
    if (lead.stage === to && board[to].some((l) => l.id === lead.id)) return;
    // Where focus goes if the card lands out of sight (a collapsed lane): the
    // card that took its place, else the one above it, else the Parked shelf.
    const from = board[lead.stage as BoardStage] ?? [];
    const at = from.findIndex((l) => l.id === lead.id);
    const neighbour = from[at + 1] ?? from[at - 1];
    setBoard((prev) => {
      const next = without(prev, lead.id);
      return { ...next, [to]: [{ ...lead, stage: to }, ...next[to]] };
    });
    requestAnimationFrame(() => {
      const card = (id: string) => document.querySelector<HTMLElement>(`[data-lead-id="${id}"] a`);
      const target = card(lead.id) ?? (neighbour && card(neighbour.id)) ?? shelfRef.current?.querySelector<HTMLElement>(`[data-shelf="${DROP_PARKED}"]`);
      target?.focus();
    });
    try {
      // Top of the lane: above the first card the user sees there.
      await api.patch(`/api/leads/${lead.id}/stage`, { stage: to, afterId: board[to].find((l) => l.id !== lead.id)?.id });
      toast(`${lead.name} moved to ${STAGE_META[to].label}.`, "success");
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

  /** Drag ended without a drop (Escape, or the pointer left the window): put everything back. */
  function onDragCancel() {
    setActiveId(null);
    homeStageRef.current = null;
    lastOverId.current = null;
    setBoard(buildBoard(leads));
  }

  /** Mid-drag, carry the card into the lane under it so the lane opens a gap. Same lane: nothing to do. */
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeKey = String(active.id);
    const overId = String(over.id);
    if (overId.startsWith("drop:")) return; // shelf targets act on drop, not while hovering

    const fromStage = findStage(activeKey);
    const toStage = findStage(overId);
    if (!fromStage || !toStage || fromStage === toStage || fromStage === "lost" || toStage === "lost") return;

    // Below the hovered card's midline goes after it.
    const translated = active.rect.current.translated;
    const below = !!translated && translated.top > over.rect.top + over.rect.height / 2;
    recentlyMovedToNewContainer.current = true;
    setBoard((prev) => {
      const from = stageIn(prev, activeKey);
      const lead = from && from !== "lost" ? prev[from].find((l) => l.id === activeKey) : undefined;
      if (!from || from === "lost" || from === toStage || !lead) return prev;
      const dest = [...prev[toStage]];
      const oi = dest.findIndex((l) => l.id === overId);
      dest.splice(oi >= 0 ? oi + (below ? 1 : 0) : dest.length, 0, { ...lead, stage: toStage });
      return { ...prev, [from]: prev[from].filter((l) => l.id !== activeKey), [toStage]: dest };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    lastOverId.current = null;
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

    // The card's current lane and slot: `onDragOver` may already have carried it
    // cross-lane. Dropped on another card in that lane takes that card's slot;
    // dropped on itself or the lane keeps the slot it has.
    const toStage = findStage(String(active.id)) as BoardStage | null;
    if (!toStage) return;
    const list = board[toStage];
    const from = list.findIndex((l) => l.id === active.id);
    const overIndex = list.findIndex((l) => l.id === overId);
    const index = overIndex >= 0 ? overIndex : from;

    // No-op: dropped back in its home lane at the same position.
    if (fromStage === toStage && index === from) {
      setBoard(buildBoard(leads));
      return;
    }

    const dest = arrayMove(list, from, index);
    setBoard({ ...board, [toStage]: dest });

    try {
      // The cards it now sits between, as the user sees the lane: the server places it relative to them.
      await api.patch(`/api/leads/${lead.id}/stage`, { stage: toStage, ...laneNeighbours(dest, lead.id) });
      if (fromStage !== toStage) toast(`${lead.name} moved to ${STAGE_META[toStage].label}.`, "success");
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
    onCreated: show,
  });

  const columns = PIPELINE_STAGES.map((s) => (collapsed.has(s) ? "56px" : "minmax(0,1fr)")).join(" ");
  const parkedOpen = !collapsed.has("parked");

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
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
          <>
            <StageJump boardRef={boardRef} totals={totals} watch={columns} />
            <div
              ref={boardRef}
              style={{ "--board-cols": columns } as CSSProperties}
              className="flex min-h-[420px] snap-x snap-mandatory gap-3 overflow-x-auto max-xl:h-[calc(100dvh-320px)] max-xl:min-h-[520px] xl:grid xl:snap-none xl:overflow-visible xl:[grid-template-columns:var(--board-cols)]"
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
          </>
        )}

        <DropShelf
          ref={shelfRef}
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

      <LostLeadModal lead={lostLead} onClose={() => setLostLead(null)} onDone={() => lostLead && hide(lostLead.id)} />
    </>
  );
}

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * Tablet only (720 to 1279px): the five stages as jump tabs above the lane
 * strip, marking the lanes in view. Tapping one scrolls its lane into view.
 * `watch` changes when lanes collapse or expand, so the observer re-attaches.
 */
function StageJump({ boardRef, totals, watch }: { boardRef: RefObject<HTMLDivElement | null>; totals: Record<PipelineStage, StageTotal>; watch: string }) {
  const [inView, setInView] = useState<PipelineStage[]>([]);
  const lane = (stage: PipelineStage) => boardRef.current?.querySelector<HTMLElement>(`[data-testid="col-${stage}"]`);

  useEffect(() => {
    const root = boardRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const shown = new Set<PipelineStage>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const stage = (e.target as HTMLElement).dataset.testid!.slice(4) as PipelineStage;
          if (e.isIntersecting) shown.add(stage);
          else shown.delete(stage);
        }
        setInView(PIPELINE_STAGES.filter((s) => shown.has(s)));
      },
      { root, threshold: 0.6 },
    );
    for (const s of PIPELINE_STAGES) {
      const el = root.querySelector(`[data-testid="col-${s}"]`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [boardRef, watch]);

  return (
    <nav aria-label="Stages" className="-mb-1 xl:hidden">
      <div className="grid grid-cols-5 gap-1">
        {PIPELINE_STAGES.map((stage) => {
          const current = inView.includes(stage);
          return (
            <button
              key={stage}
              type="button"
              aria-current={current || undefined}
              onClick={() => lane(stage)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" })}
              className={cn("rounded-card px-2.5 pb-2.5 pt-2 text-left transition-colors hover:bg-hover", current ? "bg-sunk text-ink-1" : "text-ink-2")}
            >
              <span className="flex justify-between gap-1 text-[14px]">
                <span className={cn("truncate", current ? "font-semibold" : "font-medium")}>
                  <span className="font-normal text-ink-3">{stageStep(stage)}</span>&nbsp; {STAGE_META[stage].label}
                </span>
                <span className="tnum text-ink-3">{totals[stage].count}</span>
              </span>
              <Money value={totals[stage].value} compact className={cn("figure block text-[18px]", stage === "won" && "text-paid")} />
              <WeightRule stage={stage} share={totals[stage].share} />
            </button>
          );
        })}
      </div>
      {inView.length > 0 && (
        <p className="px-2.5 pt-2 text-[12px] text-ink-3">
          Showing {listFormat.format(inView.map((s) => STAGE_META[s].label))}. Swipe sideways, or tap a stage to jump to it.
        </p>
      )}
    </nav>
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
      data-shelf={id}
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
  ref,
  dragging,
  parkedCount,
  parkedOpen,
  lostCount,
  onToggleParked,
  onShowLost,
}: {
  ref: Ref<HTMLDivElement>;
  dragging: boolean;
  parkedCount: number;
  parkedOpen: boolean;
  lostCount: number;
  onToggleParked: () => void;
  onShowLost?: () => void;
}) {
  return (
    <div
      ref={ref}
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
