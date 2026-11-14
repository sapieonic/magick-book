"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { businessDay, fromBusinessInput, toBusinessInput } from "@/lib/dates";
import type { ReminderDTO } from "@/lib/types";

const PRESETS: { label: string; at: () => Date }[] = [
  { label: "In 1 hour", at: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: "Tomorrow 9am", at: () => businessDay(Date.now(), 1, 9) },
  { label: "Next week", at: () => businessDay(Date.now(), 7, 9) },
];

/** Quick-pick chips that set a `WhenField` value ("In 1 hour", "Tomorrow 9am", "Next week"), in IST. */
export function DuePresets({ onPick, className }: { onPick: (value: string) => void; className?: string }) {
  return (
    <div role="group" aria-label="Quick picks" className={cn("flex flex-wrap gap-1.5", className)}>
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onPick(toBusinessInput(p.at()))}
          className="rounded-full border border-line-strong bg-control px-2.5 py-0.5 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink-1 max-md:px-3.5 max-md:py-2"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The required "When" date-time input. Its value is IST wall-clock time
 * (`toBusinessInput` / `fromBusinessInput`), so the label says so for anyone
 * outside India. `marked` shows the required asterisk.
 */
export function WhenField({
  value,
  onChange,
  marked,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  marked?: boolean;
  className?: string;
}) {
  return (
    <Field label="When" required={marked} hint={<abbr title="India Standard Time" className="no-underline">IST</abbr>} className={className}>
      <Input type="datetime-local" required value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

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
  const [due, setDue] = useState(() => toBusinessInput(PRESETS[0].at()));
  const [busy, setBusy] = useState(false);

  // Seed the title each time the modal opens (state persists between opens).
  useEffect(() => {
    if (open) setTitle(initialTitle);
  }, [open, initialTitle]);

  if (!open) return null;

  async function submit() {
    if (!title.trim()) return toast("Give the reminder a title.", "error");
    const dueAt = fromBusinessInput(due);
    if (!dueAt) return toast("Pick when it's due.", "error");
    setBusy(true);
    try {
      const { reminder } = await api.post<{ reminder: ReminderDTO }>("/api/reminders", {
        title: title.trim(),
        notes: notes.trim(),
        dueAt: dueAt.toISOString(),
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
        <div>
          <WhenField marked value={due} onChange={setDue} />
          <DuePresets onPick={setDue} className="mt-2" />
        </div>
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
