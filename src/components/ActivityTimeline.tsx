"use client";
import { useState } from "react";
import {
  Phone,
  MessageCircle,
  Mail,
  MessageSquare,
  StickyNote,
  Flag,
  Sparkles,
  Trophy,
  Receipt,
  Wallet,
  Pencil,
  BellRing,
  type LucideIcon,
} from "lucide-react";
import { Time } from "@/components/ui/Time";
import { Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import type { ActivityDTO } from "@/lib/types";
import type { ActivityKind } from "@/lib/constants";

const ICONS: Record<ActivityKind, LucideIcon> = {
  lead_created: Sparkles,
  stage_change: Flag,
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  sms: MessageSquare,
  note: StickyNote,
  converted: Trophy,
  invoice: Receipt,
  expense: Wallet,
  reminder: BellRing,
};

const TINT: Partial<Record<ActivityKind, string>> = {
  converted: "bg-success-bg text-success",
  stage_change: "bg-violet-50 text-violet-600",
  call: "bg-info-bg text-info",
  whatsapp: "bg-success-bg text-success",
  invoice: "bg-warn-bg text-warn",
  expense: "bg-warn-bg text-warn",
  reminder: "bg-violet-50 text-violet-600",
};

export function ActivityTimeline({
  activities,
  currentUserId,
  onEdit,
}: {
  activities: ActivityDTO[];
  /** When set together with onEdit, the viewer's own notes get an inline edit affordance. */
  currentUserId?: string;
  onEdit?: (id: string, detail: string) => Promise<void>;
}) {
  if (!activities.length) {
    return <p className="py-6 text-[13px] text-muted">No activity yet. Reach out and it&apos;ll show up here.</p>;
  }
  return (
    <ol className="relative">
      {activities.map((a, i) => {
        const Icon = ICONS[a.kind] ?? StickyNote;
        const last = i === activities.length - 1;
        const isNote = a.kind === "note";
        const canEdit = isNote && !!onEdit && !!currentUserId && a.actorId === currentUserId;
        return (
          <li key={a.id} className="group relative flex gap-3.5 pb-5">
            {!last && <span className="absolute left-[15px] top-9 h-[calc(100%-1rem)] w-px bg-line" />}
            <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ${TINT[a.kind] ?? "bg-canvas text-ink-soft"}`}>
              <Icon className="size-[15px]" strokeWidth={2.1} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13.5px] font-semibold text-ink">
                  {isNote ? "Note" : a.title}
                  {isNote && a.actorName && <span className="font-normal text-muted"> · {a.actorName}</span>}
                  {a.editedAt && <span className="font-normal text-faint"> · edited</span>}
                </p>
                <Time value={a.createdAt} className="shrink-0 text-[11.5px] text-faint" />
              </div>
              {isNote ? (
                <NoteBody activity={a} canEdit={canEdit} onEdit={onEdit} />
              ) : (
                <>
                  {a.detail && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{a.detail}</p>}
                  {a.actorName && <p className="mt-0.5 text-[11px] text-faint">by {a.actorName}</p>}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function NoteBody({
  activity,
  canEdit,
  onEdit,
}: {
  activity: ActivityDTO;
  canEdit: boolean;
  onEdit?: (id: string, detail: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(activity.detail);
  const [busy, setBusy] = useState(false);

  async function save() {
    const text = draft.trim();
    if (!text || !onEdit) return;
    setBusy(true);
    try {
      await onEdit(activity.id, text);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-1.5">
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="min-h-[56px] text-[13px]"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft(activity.detail);
              setEditing(false);
            }}
            className="text-[12.5px] font-medium text-muted hover:text-ink"
          >
            Cancel
          </button>
          <Button size="sm" variant="primary" onClick={save} loading={busy} disabled={!draft.trim()}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (!activity.detail) return null;
  return (
    <div className="group/note relative mt-1.5">
      <p className="whitespace-pre-wrap rounded-[var(--radius-sm)] border border-line bg-canvas/60 px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
        {activity.detail}
      </p>
      {canEdit && (
        <button
          type="button"
          onClick={() => {
            setDraft(activity.detail);
            setEditing(true);
          }}
          aria-label="Edit note"
          className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-[var(--radius-sm)] text-faint opacity-0 transition-all hover:bg-paper hover:text-violet-600 focus-visible:opacity-100 group-hover/note:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
}
