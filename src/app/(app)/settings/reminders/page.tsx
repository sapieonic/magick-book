"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, Plus, Trash2, Check, Clock, Send, Webhook, Info, Play } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { ReminderModal } from "@/components/reminders/ReminderModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PageLoader, ErrorState, EmptyState, Spinner } from "@/components/ui/Misc";
import { Input, Textarea, Select, Field } from "@/components/ui/Field";
import { Time } from "@/components/ui/Time";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { api, useApi } from "@/lib/client";
import { REMINDER_HTTP_METHODS, REMINDER_STATUS_META, REMINDER_TEMPLATE_VARS } from "@/lib/constants";
import type { ReminderHttpMethod } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ReminderDTO, ReminderSettingDTO } from "@/lib/types";

type Header = { key: string; value: string };

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
            <WebhookConfig
              initial={settings.data!.setting}
              defaultTemplate={settings.data!.defaultTemplate}
              onSaved={settings.refresh}
            />
          )}

          <RemindersList list={list} onCreate={() => setCreating(true)} confirm={confirm} toast={toast} />
        </div>
      </div>

      <ReminderModal open={creating} onClose={() => setCreating(false)} onCreated={() => list.refresh()} />
    </>
  );
}

/* ----------------------------------------------------------- webhook config */

function WebhookConfig({
  initial,
  defaultTemplate,
  onSaved,
}: {
  initial: ReminderSettingDTO;
  defaultTemplate: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [url, setUrl] = useState(initial.url);
  const [method, setMethod] = useState<ReminderHttpMethod>(initial.method);
  const [headers, setHeaders] = useState<Header[]>(initial.headers.length ? initial.headers : []);
  const [template, setTemplate] = useState(initial.payloadTemplate || defaultTemplate);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  function body() {
    return { enabled, url: url.trim(), method, headers: headers.filter((h) => h.key.trim()), payloadTemplate: template };
  }

  async function save() {
    setSaving(true);
    try {
      await api.put<{ setting: ReminderSettingDTO }>("/api/reminders/settings", body());
      toast("Webhook saved.", "success");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!url.trim()) return toast("Add a webhook URL first.", "error");
    setTesting(true);
    try {
      const res = await api.post<{ ok: boolean; status: number }>("/api/reminders/settings", { action: "test", ...body() });
      toast(`Webhook responded ${res.status}. 🎉`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Test failed", "error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-violet-100 text-violet-700">
          <Webhook className="size-[18px]" />
        </span>
        <div className="flex-1">
          <h2 className="font-display text-[16px] font-bold text-ink">Reminder webhook</h2>
          <p className="text-[12.5px] text-muted">When a reminder falls due, MagickBook calls this API. Wire it to Slack, Zapier, n8n, or your own endpoint.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={cn(
            "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
            enabled ? "bg-violet-500" : "bg-line-strong",
          )}
        >
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", enabled ? "left-[22px]" : "left-0.5")} />
        </button>
      </div>

      <div className={cn("mt-5 space-y-4 transition-opacity", !enabled && "opacity-60")}>
        <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as ReminderHttpMethod)}>
              {REMINDER_HTTP_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Webhook URL" required={enabled}>
            <Input placeholder="https://hooks.slack.com/services/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-ink-soft">Headers</span>
            <button type="button" onClick={() => setHeaders((h) => [...h, { key: "", value: "" }])} className="inline-flex items-center gap-1 text-[12px] font-semibold text-violet-600 hover:text-violet-700">
              <Plus className="size-3.5" /> Add header
            </button>
          </div>
          {headers.length === 0 ? (
            <p className="text-[12px] text-faint">No custom headers. Add an <code className="rounded bg-canvas px-1">Authorization</code> header if your API needs auth.</p>
          ) : (
            <div className="space-y-2">
              {headers.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Header" value={h.key} onChange={(e) => setHeaders((arr) => arr.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} className="flex-[2]" />
                  <Input placeholder="Value" value={h.value} onChange={(e) => setHeaders((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="flex-[3]" />
                  <button type="button" onClick={() => setHeaders((arr) => arr.filter((_, j) => j !== i))} aria-label="Remove header" className="rounded-md p-2 text-faint hover:bg-danger-bg hover:text-danger">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {method !== "GET" && (
          <Field label="Payload template" hint="JSON">
            <Textarea value={template} onChange={(e) => setTemplate(e.target.value)} className="min-h-[160px] font-mono text-[12px] leading-relaxed" spellCheck={false} />
          </Field>
        )}

        <div className="rounded-[var(--radius-md)] border border-line bg-canvas/60 p-3 text-[12px] text-muted">
          <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink-soft"><Info className="size-3.5" /> Available variables</p>
          <div className="flex flex-wrap gap-1.5">
            {REMINDER_TEMPLATE_VARS.map((v) => (
              <code key={v} className="rounded bg-paper px-1.5 py-0.5 text-[11.5px] text-violet-700">{`{{${v}}}`}</code>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={save} loading={saving}>Save webhook</Button>
          <Button variant="secondary" onClick={test} loading={testing}><Send className="size-4" /> Send test</Button>
          {template !== defaultTemplate && (
            <button type="button" onClick={() => setTemplate(defaultTemplate)} className="text-[12.5px] font-medium text-muted hover:text-ink">Reset template</button>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border border-violet-200 bg-violet-50/60 p-3 text-[12px] leading-relaxed text-violet-800">
        <Clock className="mt-px size-3.5 shrink-0" />
        <span>
          Reminders are delivered by a scheduled sweep. On Vercel&apos;s free tier the built-in cron runs once daily — for to-the-minute delivery, point a free external scheduler (cron-job.org or a GitHub Action) at <code className="rounded bg-paper px-1">/api/reminders/dispatch</code> with your <code className="rounded bg-paper px-1">CRON_SECRET</code>. See the README.
        </span>
      </div>
    </Card>
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
