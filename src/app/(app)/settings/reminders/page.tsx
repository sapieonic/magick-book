"use client";
import { useState } from "react";
import Link from "next/link";
import { BellRing, Plus, Trash2, Check, Clock, Webhook, Play } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { ReminderModal } from "@/components/reminders/ReminderModal";
import { WebhookForm } from "@/components/reminders/WebhookForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PageLoader, ErrorState, EmptyState, Spinner } from "@/components/ui/Misc";
import { Time } from "@/components/ui/Time";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { api, useApi } from "@/lib/client";
import { REMINDER_STATUS_META } from "@/lib/constants";
import type { ReminderDTO, ReminderSettingDTO } from "@/lib/types";

export default function RemindersSettingsPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const settings = useApi<{ setting: ReminderSettingDTO; defaultTemplate: string }>("/api/reminders/settings");
  const list = useApi<{ reminders: ReminderDTO[] }>("/api/reminders");
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader>
        <nav className="flex items-center gap-1.5 text-[13px] text-muted">
          <span>Settings</span>
          <span className="text-faint">/</span>
          <span className="font-display text-[20px] font-bold tracking-tight text-ink">Reminders</span>
        </nav>
        <Button variant="primary" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> New reminder
        </Button>
      </PageHeader>

      <SettingsTabs />

      <div className="px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-[820px] space-y-6">
          {settings.error ? (
            <ErrorState message={settings.error} onRetry={settings.refresh} />
          ) : settings.loading ? (
            <PageLoader />
          ) : (
            <Card className="p-6">
              <div className="mb-5 flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-violet-100 text-violet-700">
                  <Webhook className="size-[18px]" />
                </span>
                <div>
                  <h2 className="font-display text-[16px] font-bold text-ink">Reminder webhook</h2>
                  <p className="text-[12.5px] text-muted">Your default API. When a reminder is due, MagickBook calls it. Individual leads can override this from their page.</p>
                </div>
              </div>
              <WebhookForm
                initial={settings.data!.setting}
                defaultTemplate={settings.data!.defaultTemplate}
                onSaved={settings.refresh}
                showCronNote
              />
            </Card>
          )}

          <RemindersList list={list} onCreate={() => setCreating(true)} confirm={confirm} toast={toast} />
        </div>
      </div>

      <ReminderModal open={creating} onClose={() => setCreating(false)} onCreated={() => list.refresh()} />
    </>
  );
}

/* -------------------------------------------------------------- reminders list */

function RemindersList({
  list,
  onCreate,
  confirm,
  toast,
}: {
  list: ReturnType<typeof useApi<{ reminders: ReminderDTO[] }>>;
  onCreate: () => void;
  confirm: ReturnType<typeof useConfirm>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[16px] font-bold text-ink">Your reminders · {reminders.length}</h2>
        <Button variant="ghost" size="sm" onClick={runDueNow} loading={running}><Play className="size-3.5" /> Run due now</Button>
      </div>
      {list.error ? (
        <ErrorState message={list.error} onRetry={list.refresh} />
      ) : list.loading ? (
        <PageLoader />
      ) : reminders.length === 0 ? (
        <EmptyState
          icon={<BellRing className="size-6" />}
          title="No reminders yet"
          description="Set a reminder here, or from any lead or account, and it'll call your webhook when due."
          action={<Button variant="primary" onClick={onCreate}><Plus className="size-4" /> New reminder</Button>}
        />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {reminders.map((r) => (
            <ReminderRow key={r.id} r={r} onChanged={list.refresh} confirm={confirm} toast={toast} />
          ))}
        </Card>
      )}
    </div>
  );
}

function ReminderRow({
  r,
  onChanged,
  confirm,
  toast,
}: {
  r: ReminderDTO;
  onChanged: () => void;
  confirm: ReturnType<typeof useConfirm>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [busy, setBusy] = useState(false);
  const meta = REMINDER_STATUS_META[r.status];
  const link = r.leadId ? `/leads/${r.leadId}` : r.accountId ? `/accounts/${r.accountId}` : null;

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast(ok, "success");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update", "error");
    } finally {
      setBusy(false);
    }
  }

  async function snooze() {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await act(() => api.patch(`/api/reminders/${r.id}`, { action: "snooze", dueAt: d.toISOString() }), "Snoozed 1 day.");
  }

  async function remove() {
    if (!(await confirm({ title: "Delete this reminder?", description: "It won't fire. This can't be undone from here.", confirmLabel: "Delete", tone: "danger" }))) return;
    await act(() => api.delete(`/api/reminders/${r.id}`), "Reminder deleted.");
  }

  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
        <BellRing className="size-[15px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13.5px] font-semibold text-ink">{r.title}</p>
          <Badge tint={meta.tint}>{meta.label}</Badge>
        </div>
        <p className="mt-0.5 text-[12px] text-muted">
          <Clock className="mr-1 inline size-3" />
          <Time value={r.dueAt} />
          {r.entityLabel && link && (
            <> · <Link href={link} className="text-violet-600 hover:underline">{r.entityLabel}</Link></>
          )}
          {r.status === "failed" && r.lastError && <span className="text-danger"> · {r.lastError}</span>}
        </p>
        {r.notes && <p className="mt-1 text-[12.5px] text-ink-soft">{r.notes}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {busy ? (
          <Spinner className="size-4" />
        ) : (
          <>
            {(r.status === "scheduled" || r.status === "failed") && (
              <>
                <button onClick={() => act(() => api.patch(`/api/reminders/${r.id}`, { action: "complete" }), "Marked done.")} aria-label="Mark done" title="Mark done" className="rounded-md p-1.5 text-faint hover:bg-success-bg hover:text-success">
                  <Check className="size-4" />
                </button>
                <button onClick={snooze} aria-label="Snooze 1 day" title="Snooze 1 day" className="rounded-md p-1.5 text-faint hover:bg-violet-50 hover:text-violet-600">
                  <Clock className="size-4" />
                </button>
              </>
            )}
            <button onClick={remove} aria-label="Delete reminder" title="Delete" className="rounded-md p-1.5 text-faint hover:bg-danger-bg hover:text-danger">
              <Trash2 className="size-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
