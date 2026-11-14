"use client";
import { useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { parseAmount } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { STAGE_META, type BoardStage } from "@/lib/constants";
import type { LeadDTO } from "@/lib/types";

const EMPTY = { name: "", company: "", phone: "", value: "" };

/**
 * Inline "Add lead" at the foot of a board column: name, company, phone and
 * value, saved straight into that stage. "More fields" opens the full drawer.
 */
export function QuickAddLead({
  stage,
  onCreated,
  onMoreFields,
}: {
  stage: BoardStage;
  onCreated: (lead: LeadDTO) => void;
  onMoreFields: () => void;
}) {
  const { toast } = useToast();
  const label = STAGE_META[stage].label;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  function close() {
    setOpen(false);
    setForm(EMPTY);
    setError(null);
  }

  function field(key: keyof typeof EMPTY, placeholder: string, extra?: { inputMode?: "tel" | "numeric" }) {
    return (
      <Input
        ref={key === "name" ? nameRef : undefined}
        autoFocus={key === "name"}
        aria-label={placeholder}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        aria-invalid={!!error && (key === "name" || key === "phone") && !form[key].trim()}
        className="h-8 text-[13px]"
        {...extra}
      />
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setError("Add a name and a phone number.");
      return;
    }
    setBusy(true);
    try {
      const { lead } = await api.post<{ lead: LeadDTO }>("/api/leads", {
        name: form.name,
        company: form.company,
        phone: form.phone,
        estValue: parseAmount(form.value),
        stage,
      });
      toast(`${lead.name} added to ${label}.`, "success");
      setForm(EMPTY);
      setError(null);
      onCreated(lead);
      nameRef.current?.focus();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add lead", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" className="mt-auto w-full text-ink-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Add lead
      </Button>
    );
  }

  return (
    <form
      aria-label={`Add a lead to ${label}`}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
      className="glass-card mt-auto flex flex-col gap-1.5 rounded-card p-2"
    >
      {field("name", "Contact name")}
      {field("company", "Company")}
      {field("phone", "Phone", { inputMode: "tel" })}
      {field("value", "Est. value (₹)", { inputMode: "numeric" })}
      {error && (
        <p role="alert" className="text-[12px] text-overdue">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <Button type="submit" variant="primary" size="sm" loading={busy}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={close} disabled={busy}>
          Cancel
        </Button>
      </div>
      <LinkButton onClick={onMoreFields} className="self-start text-[13px]">
        More fields
      </LinkButton>
    </form>
  );
}
