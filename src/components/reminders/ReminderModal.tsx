"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import type { ReminderDTO } from "@/lib/types";

/** Format a Date as the local value a <input type="datetime-local"> expects. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const PRESETS: { label: string; at: () => Date }[] = [
  { label: "In 1 hour", at: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: "Tomorrow 9am", at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  { label: "Next week", at: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; } },
];

export function ReminderModal({
  open,
  onClose,
  onCreated,
  leadId,
  accountId,
  entityName,
  initialTitle = "",
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (r: ReminderDTO) => void;
  leadId?: string;
  accountId?: string;
  entityName?: string;
  /** Prefill the title — e.g. the text after `/remind` in a lead comment. */
  initialTitle?: string;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState(() => toLocalInput(PRESETS[0].at()));
  const [busy, setBusy] = useState(false);

  // Seed the title each time the modal opens (state persists between opens).
  useEffect(() => {
    if (open) setTitle(initialTitle);
  }, [open, initialTitle]);

  if (!open) return null;

  async function submit() {
    if (!title.trim()) return toast("Give the reminder a title.", "error");
    if (!due) return toast("Pick when it's due.", "error");
    setBusy(true);
    try {
      const { reminder } = await api.post<{ reminder: ReminderDTO }>("/api/reminders", {
        title: title.trim(),
        notes: notes.trim(),
        dueAt: new Date(due).toISOString(),
        leadId,
        accountId,
      });
      toast("Reminder set.", "success");
      onCreated?.(reminder);
      setTitle("");
      setNotes("");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't set reminder", "error");
    } finally {
      setBusy(false);
    }
  }

  const subtitle = entityName
    ? `It'll call your webhook when due, linked to ${entityName}.`
    : "It'll call your configured webhook when it falls due.";

  return (
    <Modal open onClose={onClose} title="Set a reminder" subtitle={subtitle} size="sm">
      <div className="space-y-4">
        <Field label="What's the reminder?" required>
          <Input autoFocus placeholder="Follow up on proposal" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="When" required>
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDue(toLocalInput(p.at()))}
                className="rounded-full border border-line-strong bg-paper px-2.5 py-1 text-[12px] font-semibold text-muted transition-all hover:border-violet-300 hover:text-violet-600"
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notes" hint="optional">
          <Textarea placeholder="Anything to remember…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className="mt-5 flex gap-3">
        <Button variant="primary" onClick={submit} loading={busy}>Set reminder</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
