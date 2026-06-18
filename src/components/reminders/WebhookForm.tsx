"use client";
import { useState } from "react";
import { Plus, Trash2, Send, Info, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { REMINDER_HTTP_METHODS, REMINDER_TEMPLATE_VARS } from "@/lib/constants";
import type { ReminderHttpMethod } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ReminderSettingDTO } from "@/lib/types";

type Header = { key: string; value: string };

/**
 * The reusable "API to call" config form. Used for the per-user default
 * (Settings) and per-lead overrides (the lead comment area). `saveExtra` targets
 * a specific config (e.g. `{ leadId }`); `onRemove` enables a remove affordance.
 */
export function WebhookForm({
  initial,
  defaultTemplate,
  saveExtra,
  onSaved,
  onRemove,
  showCronNote = false,
}: {
  initial: ReminderSettingDTO;
  defaultTemplate: string;
  saveExtra?: Record<string, unknown>;
  onSaved?: (s: ReminderSettingDTO) => void;
  onRemove?: () => Promise<void> | void;
  showCronNote?: boolean;
}) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [url, setUrl] = useState(initial.url);
  const [method, setMethod] = useState<ReminderHttpMethod>(initial.method);
  const [headers, setHeaders] = useState<Header[]>(initial.headers);
  const [template, setTemplate] = useState(initial.payloadTemplate || defaultTemplate);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  function body() {
    return { enabled, url: url.trim(), method, headers: headers.filter((h) => h.key.trim()), payloadTemplate: template };
  }

  async function save() {
    setSaving(true);
    try {
      const { setting } = await api.put<{ setting: ReminderSettingDTO }>("/api/reminders/settings", { ...body(), ...saveExtra });
      toast("Webhook saved.", "success");
      onSaved?.(setting);
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
      const res = await api.post<{ status: number }>("/api/reminders/settings", { action: "test", ...body() });
      toast(`Webhook responded ${res.status}. 🎉`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Test failed", "error");
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    if (!onRemove) return;
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled((v) => !v)}
        className="flex items-center gap-2.5 text-[13px] font-semibold text-ink"
      >
        <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", enabled ? "bg-violet-500" : "bg-line-strong")}>
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", enabled ? "left-[22px]" : "left-0.5")} />
        </span>
        {enabled ? "Enabled" : "Disabled"}
      </button>

      <div className={cn("mt-4 space-y-4 transition-opacity", !enabled && "opacity-60")}>
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
            <Textarea value={template} onChange={(e) => setTemplate(e.target.value)} className="min-h-[150px] font-mono text-[12px] leading-relaxed" spellCheck={false} />
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
          {onRemove && (
            <Button variant="ghost" onClick={remove} loading={removing} className="ml-auto text-danger hover:bg-danger-bg">Remove override</Button>
          )}
        </div>
      </div>

      {showCronNote && (
        <div className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border border-violet-200 bg-violet-50/60 p-3 text-[12px] leading-relaxed text-violet-800">
          <Clock className="mt-px size-3.5 shrink-0" />
          <span>
            Reminders are delivered by a scheduled sweep. On Vercel&apos;s free tier the built-in cron runs once daily — for to-the-minute delivery, point a free external scheduler (cron-job.org or a GitHub Action) at <code className="rounded bg-paper px-1">/api/reminders/dispatch</code> with your <code className="rounded bg-paper px-1">CRON_SECRET</code>. See the README.
          </span>
        </div>
      )}
    </div>
  );
}
