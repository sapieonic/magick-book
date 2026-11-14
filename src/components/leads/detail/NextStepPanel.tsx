"use client";
import { useState, type FormEvent } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button, LinkButton } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { DuePresets, WhenField } from "@/components/reminders/ReminderModal";
import { api } from "@/lib/client";
import { ageInWords, cn } from "@/lib/utils";
import { absoluteTime, businessDay, daysSince, dueWords, fromBusinessInput, toBusinessInput } from "@/lib/dates";
import type { ReminderDTO } from "@/lib/types";

/** The form's default: tomorrow at 9am IST. */
const tomorrowMorning = () => toBusinessInput(businessDay(Date.now(), 1, 9));

/**
 * The lead's next step: the viewer's earliest open reminder on it, or a short
 * form that creates one. `prompt` highlights the panel when an open lead has
 * no next step.
 */
export function NextStepPanel({
  leadId,
  step,
  prompt,
  onChanged,
  onMoreOptions,
  onWebhook,
}: {
  leadId: string;
  step: ReminderDTO | null;
  prompt: boolean;
  onChanged: () => void;
  /** Open the full reminder modal, prefilled with what was typed. */
  onMoreOptions: (title: string) => void;
  onWebhook: () => void;
}) {
  const { toast } = useToast();
  const [what, setWhat] = useState("");
  const [when, setWhen] = useState(tomorrowMorning);
  const [rescheduling, setRescheduling] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done, "success");
      setRescheduling(false);
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save the next step", "error");
    } finally {
      setBusy(false);
    }
  }

  /** The field's IST wall-clock value as an ISO instant, or a toast when it isn't a valid time. */
  function dueAt(): string | null {
    const at = fromBusinessInput(when);
    if (!at) toast("Pick when it happens.", "error");
    return at && at.toISOString();
  }

  function create(e: FormEvent) {
    e.preventDefault();
    if (!what.trim()) return toast("Say what happens next.", "error");
    const due = dueAt();
    if (!due) return;
    run(async () => {
      await api.post("/api/reminders", { title: what.trim(), dueAt: due, leadId });
      setWhat("");
      setWhen(tomorrowMorning());
    }, "Next step set.");
  }

  function reschedule(e: FormEvent) {
    e.preventDefault();
    const due = step && dueAt();
    if (!step || !due) return;
    run(() => api.patch(`/api/reminders/${step.id}`, { action: "snooze", dueAt: due }), "Next step moved.");
  }

  // Past its time: "Overdue" today, else "3 days overdue". Otherwise by calendar day: "Due today", "Due tomorrow".
  const now = Date.now();
  const late = !!step && new Date(step.dueAt).getTime() < now;
  const overdueDays = step ? daysSince(step.dueAt, now) : 0;

  return (
    <Panel
      title="Next step"
      actions={
        step ? (
          <span className={cn("tnum inline-block text-[12px] font-medium first-letter:uppercase", late ? "text-overdue" : "text-ink-3")}>
            {late ? (overdueDays < 1 ? "Overdue" : `${ageInWords(overdueDays)} overdue`) : dueWords(step.dueAt, now)}
          </span>
        ) : (
          <span className="text-[12px] font-medium text-due">Not set</span>
        )
      }
      className={cn(prompt && !step && "border-accent/40 bg-accent-tint/70")}
    >
      {step && !rescheduling ? (
        <>
          <p className="font-medium text-ink-1">{step.title}</p>
          <p className="tnum mt-0.5 text-[13px] text-ink-2">
            {absoluteTime(step.dueAt)} IST
            {step.status === "sent" && " · reminder sent"}
            {step.status === "failed" && <span className="text-overdue"> · reminder failed{step.lastError && `: ${step.lastError}`}</span>}
          </p>
          {step.notes && <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-ink-2">{step.notes}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => run(() => api.patch(`/api/reminders/${step.id}`, { action: "complete" }), "Next step done.")} loading={busy}>
              Mark done
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setWhen(toBusinessInput(step.dueAt));
                setRescheduling(true);
              }}
            >
              Reschedule
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={step ? reschedule : create}>
          {step ? (
            <p className="mb-3 text-[13px] text-ink-2">
              Move <span className="font-medium text-ink-1">{step.title}</span> to a new time.
            </p>
          ) : (
            <>
              <p className="mb-3 text-[13px] text-ink-2">Every open lead needs one. Saving it creates a reminder.</p>
              <Field label="What happens next">
                <Input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Call back about pilot pricing" />
              </Field>
            </>
          )}
          <div className="mt-2.5 flex items-end gap-2">
            <WhenField value={when} onChange={setWhen} className="flex-1" />
            <Button type="submit" variant="primary" loading={busy} aria-label="Save next step">
              Save
            </Button>
            {step && (
              <Button type="button" variant="ghost" onClick={() => setRescheduling(false)}>
                Cancel
              </Button>
            )}
          </div>
          <DuePresets onPick={setWhen} className="mt-2" />
        </form>
      )}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[13px]">
        <LinkButton onClick={() => onMoreOptions(what.trim())}>
          {step ? "Another reminder" : "More options"}
        </LinkButton>
        <LinkButton onClick={onWebhook}>
          Webhook for this lead
        </LinkButton>
      </div>
    </Panel>
  );
}
