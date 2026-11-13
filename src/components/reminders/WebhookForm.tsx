"use client";
import { useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import { Input, Textarea, Select, Field, Label } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { REMINDER_HTTP_METHODS, REMINDER_TEMPLATE_VARS } from "@/lib/constants";
import type { ReminderHttpMethod } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ReminderSettingDTO } from "@/lib/types";

type Header = { key: string; value: string };

const CODE = "rounded-bar bg-sunk px-1 font-mono text-[12px] text-ink-1";

/**
 * The reusable "API to call" config form. Used for the per-user default
 * (Settings) and per-lead overrides (the lead page). `saveExtra` targets
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

  function editHeader(i: number, patch: Partial<Header>) {
    setHeaders((arr) => arr.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { setting } = await api.put<{ setting: ReminderSettingDTO }>("/api/reminders/settings", { ...body(), ...saveExtra });
      toast("Webhook saved.", "success");
      onSaved?.(setting);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!url.trim()) return toast("Add a webhook URL first.", "error");
    setTesting(true);
    try {
      const res = await api.post<{ status: number }>("/api/reminders/settings", { action: "test", ...body() });
      toast(`Webhook responded ${res.status}.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Test failed", "error");
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
    <form onSubmit={save}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled((v) => !v)}
        className="flex items-center gap-2.5 rounded-full font-medium text-ink-1"
      >
        <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", enabled ? "bg-accent" : "bg-line-strong")}>
          <span className={cn("absolute top-0.5 size-4 rounded-full bg-surface shadow-card transition-[left]", enabled ? "left-[18px]" : "left-0.5")} />
        </span>
        Call this webhook when a reminder is due
      </button>

      <div className={cn("mt-4 space-y-4 transition-opacity", !enabled && "opacity-70")}>
        <div className="grid gap-3 sm:grid-cols-[112px_minmax(0,1fr)]">
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as ReminderHttpMethod)}>
              {REMINDER_HTTP_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Webhook URL" required={enabled}>
            <Input inputMode="url" placeholder="https://hooks.slack.com/services/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <Label>Headers</Label>
            <Button type="button" variant="ghost" size="sm" onClick={() => setHeaders((h) => [...h, { key: "", value: "" }])}>
              <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Add header
            </Button>
          </div>
          {headers.length === 0 ? (
            <p className="text-[13px] text-ink-3">
              No custom headers. Add an <code className={CODE}>Authorization</code> header if your API needs auth.
            </p>
          ) : (
            <ul className="space-y-2">
              {headers.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <Input aria-label={`Header ${i + 1} name`} placeholder="Header" value={h.key} onChange={(e) => editHeader(i, { key: e.target.value })} className="flex-[2] font-mono text-[13px]" />
                  <Input aria-label={`Header ${i + 1} value`} placeholder="Value" value={h.value} onChange={(e) => editHeader(i, { value: e.target.value })} className="flex-[3] font-mono text-[13px]" />
                  <Button type="button" variant="ghost" onClick={() => setHeaders((arr) => arr.filter((_, j) => j !== i))} aria-label={`Remove header ${i + 1}`}>
                    <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {method !== "GET" && (
          <Field
            label="Payload template"
            hint={
              template !== defaultTemplate ? (
                <LinkButton onClick={() => setTemplate(defaultTemplate)}>
                  Reset to default
                </LinkButton>
              ) : (
                "JSON"
              )
            }
          >
            <Textarea value={template} onChange={(e) => setTemplate(e.target.value)} className="min-h-[150px] font-mono text-[12px] leading-relaxed" spellCheck={false} />
          </Field>
        )}

        <div className="text-[13px] text-ink-3">
          <p className="mb-1.5">Variables for header values and the payload</p>
          <ul className="flex flex-wrap gap-1.5">
            {REMINDER_TEMPLATE_VARS.map((v) => (
              <li key={v}>
                <code className={CODE}>{`{{${v}}}`}</code>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={saving}>Save webhook</Button>
          <Button type="button" variant="secondary" onClick={test} loading={testing}>
            <Send className="size-4" strokeWidth={1.5} aria-hidden /> Send test
          </Button>
          {onRemove && (
            <Button type="button" variant="danger" onClick={remove} loading={removing} className="ml-auto">
              Remove override
            </Button>
          )}
        </div>
      </div>

      {showCronNote && (
        <p className="mt-5 border-t border-line pt-4 text-[13px] text-ink-2">
          Reminders go out on a scheduled sweep. On Vercel&apos;s free tier the built-in cron runs once a day; for to-the-minute delivery, point a free
          external scheduler (cron-job.org or a GitHub Action) at <code className={CODE}>/api/reminders/dispatch</code> with your{" "}
          <code className={CODE}>CRON_SECRET</code>. See the README.
        </p>
      )}
    </form>
  );
}
