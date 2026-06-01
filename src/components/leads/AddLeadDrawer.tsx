"use client";
import { useRef, useState } from "react";
import { Drawer } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { LEAD_SOURCES, PIPELINE_STAGES, STAGE_META } from "@/lib/constants";
import type { LeadDTO } from "@/lib/types";

const empty = { name: "", company: "", phone: "", email: "", source: "Website", stage: "new", estValue: "", notes: "" };

function fromLead(lead: LeadDTO) {
  return {
    name: lead.name,
    company: lead.company,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    stage: lead.stage,
    estValue: lead.estValue ? String(lead.estValue) : "",
    notes: lead.notes,
  };
}

export function AddLeadDrawer({
  open,
  onClose,
  onCreated,
  onSaved,
  defaultStage,
  lead,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (lead: LeadDTO) => void;
  onSaved?: (lead: LeadDTO) => void;
  defaultStage?: string;
  lead?: LeadDTO;
}) {
  const { toast } = useToast();
  const isEdit = !!lead;
  const [form, setForm] = useState(() => (lead ? fromLead(lead) : { ...empty, stage: defaultStage ?? "new" }));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; email?: string; estValue?: string }>({});

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const estValueRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k as keyof typeof e] ? { ...e, [k]: undefined } : e));
  }

  function reset() {
    setForm(lead ? fromLead(lead) : { ...empty, stage: defaultStage ?? "new" });
    setErrors({});
  }

  async function save(addAnother: boolean) {
    const nextErrors: typeof errors = {};
    if (!form.name.trim()) nextErrors.name = "A contact name is required.";
    // Phone is only enforced on create — existing leads may predate the requirement (the server treats it as optional).
    if (!isEdit && !form.phone.trim()) nextErrors.phone = "A phone number is required.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (form.estValue.trim()) {
      const parsed = Number(String(form.estValue).replace(/[^\d.]/g, ""));
      if (!Number.isFinite(parsed) || parsed < 0) nextErrors.estValue = "Enter a non-negative amount.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const focusTarget = nextErrors.name
        ? nameRef
        : nextErrors.phone
          ? phoneRef
          : nextErrors.email
            ? emailRef
            : estValueRef;
      focusTarget.current?.focus();
      return;
    }

    setErrors({});
    setBusy(true);
    const payload = { ...form, estValue: Number(String(form.estValue).replace(/[^\d.]/g, "")) || 0 };
    try {
      if (isEdit) {
        const { lead: updated } = await api.patch<{ lead: LeadDTO }>(`/api/leads/${lead!.id}`, payload);
        onSaved?.(updated);
        toast("Lead updated.", "success");
        onClose();
      } else {
        const { lead: created } = await api.post<{ lead: LeadDTO }>("/api/leads", payload);
        onCreated?.(created);
        toast(`${created.name} added to ${STAGE_META[created.stage].label}.`, "success");
        if (addAnother) reset();
        else {
          onClose();
          reset();
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save lead", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit lead" : "Add a lead"}
      subtitle={isEdit ? "Update the details and save." : "Only ★ fields are required. Add the rest whenever you like."}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        className="space-y-4"
      >
        <Field label="Contact name" required error={errors.name}>
          <Input ref={nameRef} autoFocus aria-invalid={!!errors.name} placeholder="Priya Sharma" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Company">
          <Input placeholder="Lumen Retail" value={form.company} onChange={(e) => set("company", e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" required={!isEdit} error={errors.phone}>
            <Input ref={phoneRef} aria-invalid={!!errors.phone} placeholder="+91 …" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input ref={emailRef} type="email" aria-invalid={!!errors.email} placeholder="name@company" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <Select value={form.source} onChange={(e) => set("source", e.target.value)}>
              {LEAD_SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Stage">
            <Select value={form.stage} onChange={(e) => set("stage", e.target.value)}>
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_META[s].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Est. value" hint="optional" error={errors.estValue}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[14px] text-muted">₹</span>
            <Input ref={estValueRef} aria-invalid={!!errors.estValue} className="pl-7 tnum font-mono" inputMode="numeric" placeholder="1,20,000" value={form.estValue} onChange={(e) => set("estValue", e.target.value)} />
          </div>
        </Field>

        <Field label="Notes">
          <Textarea placeholder="how did they hear about us? what do they need?" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" variant="primary" loading={busy}>
            {isEdit ? "Save changes" : "Save lead"}
          </Button>
          {!isEdit && (
            <Button type="button" variant="dashed" loading={busy} onClick={() => save(true)}>
              Save & add another
            </Button>
          )}
        </div>
      </form>
    </Drawer>
  );
}
