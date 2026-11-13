"use client";
import { useState } from "react";
import { Textarea } from "@/components/ui/Field";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { MEETING_TITLE, type ActivityKind } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { absoluteTime, monthYear, shortDate } from "@/lib/dates";
import type { ActivityDTO } from "@/lib/types";

const KIND_LABEL: Record<ActivityKind, string> = {
  lead_created: "Created",
  stage_change: "Stage",
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
  note: "Note",
  converted: "Converted",
  invoice: "Invoice",
  expense: "Expense",
  reminder: "Reminder",
};

/** Kinds a person writes (their text leads the row); the rest are system entries. */
const LOGGED = new Set<ActivityKind>(["note", "call", "whatsapp", "email", "sms"]);

function activityLabel(a: Pick<ActivityDTO, "kind" | "title">): string {
  return a.kind === "note" && a.title === MEETING_TITLE ? "Meeting" : KIND_LABEL[a.kind] ?? "Note";
}

/**
 * Ledger-style timeline grouped by month: date, kind, then what happened.
 * Expects activities newest first.
 */
export function ActivityTimeline({
  activities,
  currentUserId,
  onEdit,
  collapseAfter,
}: {
  activities: ActivityDTO[];
  /** When set together with onEdit, the viewer's own notes get an inline edit affordance. */
  currentUserId?: string;
  onEdit?: (id: string, detail: string) => Promise<void>;
  /** Show only this many entries until the viewer asks for the earlier ones. */
  collapseAfter?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!activities.length) {
    return <EmptyState title="No activity yet" description="Log a call or add a note and it shows up here." className="py-8" />;
  }

  const visible = expanded || !collapseAfter ? activities : activities.slice(0, collapseAfter);
  const hidden = activities.length - visible.length;
  const months: { label: string; items: ActivityDTO[] }[] = [];
  for (const a of visible) {
    const label = monthYear(a.createdAt);
    if (months.at(-1)?.label !== label) months.push({ label, items: [] });
    months.at(-1)!.items.push(a);
  }

  return (
    <div>
      {months.map((m) => (
        <section key={m.label} aria-label={m.label}>
          <h3 className="pb-0.5 pt-3.5 text-[12px] font-medium text-ink-3">{m.label}</h3>
          <ol>
            {m.items.map((a) => (
              <ActivityRow
                key={a.id}
                activity={a}
                onEdit={a.kind === "note" && !!currentUserId && a.actorId === currentUserId ? onEdit : undefined}
              />
            ))}
          </ol>
        </section>
      ))}
      {hidden > 0 && (
        <LinkButton onClick={() => setExpanded(true)} className="mt-3 text-[13px]">
          Show {hidden} earlier {hidden === 1 ? "entry" : "entries"}
        </LinkButton>
      )}
    </div>
  );
}

function ActivityRow({ activity: a, onEdit }: { activity: ActivityDTO; onEdit?: (id: string, detail: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const logged = LOGGED.has(a.kind);
  const meta = [a.actorName, a.editedAt && "edited"].filter(Boolean).join(" · ");

  return (
    <li className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 border-b border-line py-[11px] md:grid-cols-[52px_72px_minmax(0,1fr)]">
      <time dateTime={a.createdAt} title={absoluteTime(a.createdAt)} className="tnum text-[13px] text-ink-3">
        {shortDate(a.createdAt, false)}
      </time>
      <span className={cn("text-[13px] max-md:col-start-1 max-md:row-start-2", logged ? "font-medium text-ink-1" : "text-ink-2")}>
        {activityLabel(a)}
      </span>
      <div className="min-w-0 max-md:col-start-2 max-md:row-span-2 max-md:row-start-1">
        {editing && onEdit ? (
          <NoteEditor activity={a} onEdit={onEdit} onDone={() => setEditing(false)} />
        ) : logged ? (
          <p className="max-w-[72ch] whitespace-pre-wrap break-words text-ink-1">{a.detail || <span className="text-ink-2">{a.title}</span>}</p>
        ) : (
          <p className="max-w-[72ch] break-words text-ink-2">
            <span className="font-medium text-ink-1">{a.title}</span>
            {a.detail && <> · {a.detail}</>}
          </p>
        )}
        {(meta || onEdit) && !editing && (
          <p className="mt-0.5 text-[12px] text-ink-3">
            {meta}
            {onEdit && (
              <>
                {meta && " · "}
                <LinkButton onClick={() => setEditing(true)} aria-label="Edit note">
                  Edit
                </LinkButton>
              </>
            )}
          </p>
        )}
      </div>
    </li>
  );
}

function NoteEditor({
  activity,
  onEdit,
  onDone,
}: {
  activity: ActivityDTO;
  onEdit: (id: string, detail: string) => Promise<void>;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(activity.detail);
  const [busy, setBusy] = useState(false);

  async function save() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      await onEdit(activity.id, text);
      onDone();
    } catch {
      // The caller reports the failure; keep the draft open for another try.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Textarea
        autoFocus
        aria-label="Note"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
          if (e.key === "Escape") onDone();
        }}
        className="min-h-[64px]"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={save} loading={busy} disabled={!draft.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}
