"use client";
import { useState } from "react";
import Link from "next/link";
import { BellRing, Check, Clock, Play, Plus, Trash2 } from "lucide-react";
import { PageSplit } from "@/components/layout/Page";
import { SettingsHeader } from "@/components/settings/SettingsTabs";
import { ReminderModal } from "@/components/reminders/ReminderModal";
import { WebhookForm } from "@/components/reminders/WebhookForm";
import { StatusPill, type StatusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyState, ErrorState, RowsSkeleton, Skeleton, Spinner } from "@/components/ui/Misc";
import { Panel } from "@/components/ui/Panel";
import { Time } from "@/components/ui/Time";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import { DAY_MS } from "@/lib/dates";
import { REMINDER_STATUS_META, type ReminderStatus } from "@/lib/constants";
import type { ReminderDTO, ReminderSettingDTO } from "@/lib/types";

const STATUS_TONE: Record<ReminderStatus, StatusTone> = {
  scheduled: "due",
  sent: "paid",
  failed: "overdue",
  done: "lost",
  canceled: "lost",
};

export default function RemindersSettingsPage() {
  const { toast } = useToast();
  const settings = useApi<{ setting: ReminderSettingDTO; defaultTemplate: string }>("/api/reminders/settings");
  const list = useApi<{ reminders: ReminderDTO[] }>("/api/reminders");
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);
  const reminders = list.data?.reminders ?? [];

  async function runDueNow() {
    setRunning(true);
    try {
      const res = await api.post<{ sent: number; due: number; skipped: number }>("/api/reminders/dispatch", {});
      toast(res.due === 0 ? "Nothing due right now." : `Delivered ${res.sent} of ${res.due} due.`, res.skipped && !res.sent ? "info" : "success");
      list.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't run", "error");
    } finally {
      setRunning(false);
    }
  }

  // Secondary in the top bar (the ink button there is the shell's "New"); primary as the empty state's call to action.
  const newReminder = (variant?: "primary") => (
    <Button variant={variant} onClick={() => setCreating(true)}>
      <Plus className="size-4" strokeWidth={1.5} aria-hidden /> New reminder
    </Button>
  );

  return (
    <>
      <SettingsHeader title="Reminders" actions={newReminder()} />

      <PageSplit
        railLabel="Your reminders"
        rail={
          <Panel
            title="Your reminders"
            meta={list.loading ? undefined : reminders.length}
            actions={
              <Button variant="ghost" size="sm" onClick={runDueNow} loading={running}>
                <Play className="size-4" strokeWidth={1.5} aria-hidden /> Run due now
              </Button>
            }
            ruled
            className="md:col-span-2"
          >
            {list.error ? (
              <ErrorState message={list.error} onRetry={list.refresh} />
            ) : list.loading ? (
              <RowsSkeleton rows={3} label="Loading reminders" />
            ) : reminders.length === 0 ? (
              <EmptyState
                className="mt-3"
                icon={<BellRing className="size-6" strokeWidth={1.5} aria-hidden />}
                title="No reminders yet"
                description="Set one here, or from any lead or account. It calls your webhook when due."
                action={newReminder("primary")}
              />
            ) : (
              <ul>
                {reminders.map((r) => (
                  <ReminderRow key={r.id} r={r} onChanged={list.refresh} />
                ))}
              </ul>
            )}
          </Panel>
        }
      >
        <Panel title="Reminder webhook" ruled>
          <p className="mb-4 mt-2 text-[13px] text-ink-2">
            Your default API. When a reminder is due, MagickBook calls it. Individual leads can override this from their page.
          </p>
          {settings.error ? (
            <ErrorState message={settings.error} onRetry={settings.refresh} />
          ) : settings.loading || !settings.data ? (
            <div className="space-y-4" aria-busy="true" aria-label="Loading webhook">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-[34px] w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : (
            <WebhookForm initial={settings.data.setting} defaultTemplate={settings.data.defaultTemplate} onSaved={settings.refresh} showCronNote />
          )}
        </Panel>
      </PageSplit>

      <ReminderModal open={creating} onClose={() => setCreating(false)} onCreated={list.refresh} />
    </>
  );
}

function ReminderRow({ r, onChanged }: { r: ReminderDTO; onChanged: () => void }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const link = r.leadId ? `/leads/${r.leadId}` : r.accountId ? `/accounts/${r.accountId}` : null;
  const open = r.status === "scheduled" || r.status === "failed";

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast(done, "success");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update", "error");
    } finally {
      setBusy(false);
    }
  }

  const complete = () => act(() => api.patch(`/api/reminders/${r.id}`, { action: "complete" }), "Marked done.");
  const snooze = () =>
    act(() => api.patch(`/api/reminders/${r.id}`, { action: "snooze", dueAt: new Date(Date.now() + DAY_MS).toISOString() }), "Snoozed 1 day.");

  async function remove() {
    const ok = await confirm({ title: "Delete this reminder?", description: "It won't fire. This can't be undone from here.", confirmLabel: "Delete", tone: "danger" });
    if (ok) await act(() => api.delete(`/api/reminders/${r.id}`), "Reminder deleted.");
  }

  return (
    <li className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-medium text-ink-1">{r.title}</p>
          <StatusPill tone={STATUS_TONE[r.status]}>{REMINDER_STATUS_META[r.status].label}</StatusPill>
        </div>
        <p className="mt-0.5 text-[13px] text-ink-3">
          <Time value={r.dueAt} />
          {r.entityLabel && link && (
            <>
              {" · "}
              <Link href={link} className="link">{r.entityLabel}</Link>
            </>
          )}
          {r.status === "failed" && r.lastError && <span className="text-overdue"> · {r.lastError}</span>}
        </p>
        {r.notes && <p className="mt-1 text-[13px] text-ink-2">{r.notes}</p>}
      </div>
      <div className="flex shrink-0 items-center">
        {busy ? (
          <Spinner className="m-1.5 size-4" />
        ) : (
          <>
            {open && (
              <>
                <IconAction label="Mark done" onClick={complete} icon={Check} />
                <IconAction label="Snooze 1 day" onClick={snooze} icon={Clock} />
              </>
            )}
            <IconAction label="Delete reminder" onClick={remove} icon={Trash2} />
          </>
        )}
      </div>
    </li>
  );
}

function IconAction({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof Check }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} aria-label={label} title={label}>
      <Icon className="size-4" strokeWidth={1.5} aria-hidden />
    </Button>
  );
}

