"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Ban } from "lucide-react";
import { LeadCard } from "./LeadCard";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Textarea, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { PIPELINE_STAGES, STAGE_META, type PipelineStage } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { LeadDTO } from "@/lib/types";

type Board = Record<string, LeadDTO[]>;

function buildBoard(leads: LeadDTO[]): Board {
  const board: Board = {};
  for (const s of PIPELINE_STAGES) board[s] = [];
  for (const l of leads) {
    // Lost leads (and any non-pipeline stage) aren't shown on the board.
    if (!(PIPELINE_STAGES as readonly string[]).includes(l.stage)) continue;
    board[l.stage].push(l);
  }
  for (const s of PIPELINE_STAGES) board[s].sort((a, b) => a.order - b.order || +new Date(a.createdAt) - +new Date(b.createdAt));
  return board;
}

export function LeadBoard({ leads, onAdd, onChanged }: { leads: LeadDTO[]; onAdd: (stage: PipelineStage) => void; onChanged: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [board, setBoard] = useState<Board>(() => buildBoard(leads));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lostLead, setLostLead] = useState<LeadDTO | null>(null);

  useEffect(() => setBoard(buildBoard(leads)), [leads]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const activeLead = useMemo(() => leads.find((l) => l.id === activeId) ?? null, [activeId, leads]);

  function findStage(id: string): string | null {
    if (id.startsWith("col:")) return id.slice(4);
    for (const s of PIPELINE_STAGES) if (board[s].some((l) => l.id === id)) return s;
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const fromStage = findStage(String(active.id));
    const toStage = findStage(String(over.id));
    if (!fromStage || !toStage) return;

    const lead = board[fromStage].find((l) => l.id === active.id);
    if (!lead) return;

    // Dropping onto the "lost" zone opens the reason modal instead of moving.
    if (toStage === "lost") {
      setLostLead(lead);
      return;
    }

    // Compute insert index within target column.
    const overId = String(over.id);
    const targetList = board[toStage].filter((l) => l.id !== active.id);
    let index = targetList.length;
    if (!overId.startsWith("col:")) {
      const oi = targetList.findIndex((l) => l.id === overId);
      if (oi >= 0) index = oi;
    }
    if (fromStage === toStage && board[fromStage].findIndex((l) => l.id === active.id) === index) return;

    // Optimistic update.
    const next: Board = { ...board, [fromStage]: board[fromStage].filter((l) => l.id !== active.id) };
    const moved = { ...lead, stage: toStage as LeadDTO["stage"], order: index };
    const dest = [...(next[toStage] ?? []).filter((l) => l.id !== active.id)];
    dest.splice(index, 0, moved);
    next[toStage] = dest.map((l, i) => ({ ...l, order: i }));
    if (fromStage !== toStage) next[fromStage] = next[fromStage].map((l, i) => ({ ...l, order: i }));
    setBoard(next);

    try {
      await api.patch(`/api/leads/${lead.id}/stage`, { stage: toStage, order: index });
      if (fromStage !== toStage) {
        toast(`${lead.name} → ${STAGE_META[toStage as PipelineStage].label}`, "success");
        onChanged();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't move lead", "error");
      setBoard(buildBoard(leads));
    }
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const fromStage = findStage(activeId);
    const toStage = findStage(overId);

    if (!fromStage || !toStage || fromStage === toStage || toStage === "lost") return;

    setBoard((prev) => {
      const lead = prev[fromStage].find((l) => l.id === activeId);
      if (!lead) return prev;

      const targetList = prev[toStage].filter((l) => l.id !== activeId);
      let index = targetList.length;
      if (!overId.startsWith("col:")) {
        const oi = targetList.findIndex((l) => l.id === overId);
        if (oi >= 0) index = oi;
      }

      const next = { ...prev };
      next[fromStage] = prev[fromStage].filter((l) => l.id !== activeId);
      const dest = [...targetList];
      dest.splice(index, 0, { ...lead, stage: toStage as LeadDTO["stage"] });
      next[toStage] = dest;
      return next;
    });
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto px-6 pb-6 lg:px-8">
          {PIPELINE_STAGES.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              leads={board[stage] ?? []}
              onAdd={() => onAdd(stage)}
              onOpen={(id) => router.push(`/leads/${id}`)}
              onDropLost={stage === "won" ? setLostLead : undefined}
              activeId={activeId}
            />
          ))}
        </div>
        <DragOverlay>{activeLead ? <div className="w-[268px]"><LeadCard lead={activeLead} dragging /></div> : null}</DragOverlay>
      </DndContext>

      <LostModal lead={lostLead} onClose={() => setLostLead(null)} onDone={onChanged} />
    </>
  );
}

function Column({
  stage,
  leads,
  onAdd,
  onOpen,
  onDropLost,
  activeId,
}: {
  stage: PipelineStage;
  leads: LeadDTO[];
  onAdd: () => void;
  onOpen: (id: string) => void;
  onDropLost?: (lead: LeadDTO) => void;
  activeId: string | null;
}) {
  const meta = STAGE_META[stage];
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage}` });
  const lostZone = useDroppable({ id: "col:lost" });

  return (
    <div className="flex w-[296px] shrink-0 flex-col rounded-[var(--radius-xl)] bg-canvas/40 border border-line/40 backdrop-blur-xl shadow-sm dark:bg-canvas/10 dark:border-line-strong overflow-hidden relative">
      {/* Top glowing accent line */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: meta.dot, boxShadow: `0 0 10px ${meta.dot}` }} />

      <div className="mb-1 flex items-center justify-between px-3 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold tracking-wide uppercase" style={{ color: meta.dot }}>{meta.label}</h3>
          <span className="rounded-full bg-paper/60 px-2 py-0.5 text-[11.5px] font-bold tnum text-ink-soft shadow-inner dark:bg-canvas/40">
            {leads.length}
          </span>
        </div>
        <button onClick={onAdd} className="rounded-full p-1.5 text-faint transition-colors hover:bg-violet-100 hover:text-violet-700 dark:hover:bg-violet-900/50 dark:hover:text-violet-300" aria-label={`Add to ${meta.label}`}>
          <Plus className="size-4" />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[150px] flex-1 flex-col gap-3 p-3 transition-colors",
          isOver ? "bg-violet-50/50 ring-inset ring-2 ring-violet-200 dark:bg-violet-900/20 dark:ring-violet-700/50" : "",
        )}
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <SortableCard key={lead.id} lead={lead} onOpen={() => onOpen(lead.id)} hidden={activeId === lead.id} />
          ))}
        </SortableContext>

        <button
          onClick={onAdd}
          className="flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-line-strong py-2.5 text-[12.5px] font-medium text-faint transition-colors hover:border-violet-400 hover:text-violet-600"
        >
          <Plus className="size-3.5" /> add lead
        </button>

        {/* Won column doubles as the "mark lost" drop target, per the wireframe. */}
        {stage === "won" && onDropLost && (
          <div
            ref={lostZone.setNodeRef}
            className={cn(
              "mt-1 flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-dashed py-2.5 text-[12px] font-semibold transition-colors",
              lostZone.isOver ? "border-danger bg-danger-bg text-danger" : "border-line-strong text-faint",
            )}
          >
            <Ban className="size-3.5" /> Lost · drop &amp; tag reason
          </div>
        )}
      </div>
    </div>
  );
}

function SortableCard({ lead, onOpen, hidden }: { lead: LeadDTO; onOpen: () => void; hidden: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: hidden || isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className="cursor-grab active:cursor-grabbing"
    >
      <LeadCard lead={lead} />
    </div>
  );
}

const QUICK_REASONS = ["Price", "Competitor", "No response", "Bad timing", "Not a fit"] as const;

function LostModal({ lead, onClose, onDone }: { lead: LeadDTO | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setReason(""), [lead]);

  async function submit(overrideReason?: string) {
    if (!lead) return;
    const finalReason = (overrideReason ?? reason).trim();
    setBusy(true);
    try {
      await api.patch(`/api/leads/${lead.id}/stage`, { stage: "lost", lostReason: finalReason });
      toast(`${lead.name} marked lost.`, "info");
      onDone();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!lead} onClose={onClose} title="Mark as lost" subtitle={`What happened with ${lead?.name ?? "this lead"}?`} size="sm">
      <Field label="Reason" hint="tap a common reason or write your own">
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => {
            const active = reason.trim().toLowerCase() === r.toLowerCase();
            return (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={() => submit(r)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                  active
                    ? "border-danger/40 bg-danger-bg text-danger"
                    : "border-line-strong text-ink-soft hover:border-danger/40 hover:bg-danger-bg hover:text-danger",
                )}
              >
                {r}
              </button>
            );
          })}
        </div>
        <Textarea autoFocus placeholder="Other reason — budget, went with competitor…" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-5 flex gap-3">
        <Button variant="danger" onClick={() => submit()} loading={busy}>
          Mark lost
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
