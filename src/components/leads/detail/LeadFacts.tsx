"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { AmountInput, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import { DEFAULT_LEAD_CATEGORIES, DEFAULT_LEAD_CATEGORY, LEAD_SOURCES, formatCategoryLabel } from "@/lib/constants";
import { shortDate } from "@/lib/dates";
import type { LeadDTO } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function draftOf(lead: LeadDTO) {
  return {
    company: lead.company,
    title: lead.title,
    phone: lead.phone,
    email: lead.email,
    estValue: lead.estValue ? String(lead.estValue) : "",
    category: lead.category || DEFAULT_LEAD_CATEGORY,
    source: lead.source,
    tags: lead.tags.join(", "),
    notes: lead.notes,
  };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="border-b border-line py-2 text-[13px] text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words border-b border-line py-2">{children}</dd>
    </>
  );
}

const unset = <span className="text-ink-3">Not set</span>;

/** The lead's facts as a ledger list, edited in place. */
export function LeadFacts({ lead, canEdit, onSaved }: { lead: LeadDTO; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <Panel
      title="Details"
      ruled
      actions={
        canEdit &&
        !editing && (
          <LinkButton onClick={() => setEditing(true)} aria-label="Edit details">
            Edit
          </LinkButton>
        )
      }
    >
      {editing ? (
        <FactsForm
          lead={lead}
          onDone={(saved) => {
            setEditing(false);
            if (saved) onSaved();
          }}
        />
      ) : (
        <dl className="grid grid-cols-[112px_minmax(0,1fr)]">
          <Fact label="Phone">{lead.phone ? <a className="link tnum" href={`tel:${lead.phone}`}>{lead.phone}</a> : unset}</Fact>
          <Fact label="Email">{lead.email ? <a className="link" href={`mailto:${lead.email}`}>{lead.email}</a> : unset}</Fact>
          <Fact label="Company">{lead.company || unset}</Fact>
          <Fact label="Title">{lead.title || unset}</Fact>
          <Fact label="Estimated value">
            <Money value={lead.estValue} />
          </Fact>
          <Fact label="Category">
            {lead.category && lead.category !== DEFAULT_LEAD_CATEGORY ? <Tag>{formatCategoryLabel(lead.category)}</Tag> : unset}
          </Fact>
          <Fact label="Source">{lead.source}</Fact>
          <Fact label="Owner">{lead.ownerName || unset}</Fact>
          <Fact label="Tags">
            {lead.tags.length ? (
              <span className="flex flex-wrap gap-1">
                {lead.tags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </span>
            ) : (
              unset
            )}
          </Fact>
          <Fact label="Created">
            <span className="tnum">{shortDate(lead.createdAt)}</span>
          </Fact>
          {lead.notes && (
            <Fact label="Notes">
              <span className="whitespace-pre-wrap text-ink-2">{lead.notes}</span>
            </Fact>
          )}
        </dl>
      )}
    </Panel>
  );
}

function FactsForm({ lead, onDone }: { lead: LeadDTO; onDone: (saved: boolean) => void }) {
  const { toast } = useToast();
  const { data: catData } = useApi<{ categories: string[] }>("/api/workspace/categories");
  const categories = catData?.categories?.length ? catData.categories : [...DEFAULT_LEAD_CATEGORIES];
  // Keep a removed-but-still-assigned category selectable.
  const categoryOptions = categories.includes(lead.category) ? categories : [...categories, lead.category];
  const [form, setForm] = useState(() => draftOf(lead));
  const [errors, setErrors] = useState<{ email?: string; estValue?: string }>({});
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const value = form.estValue.trim() ? Number(form.estValue.replace(/,/g, "")) : 0;
    const next = {
      email: form.email.trim() && !EMAIL.test(form.email.trim()) ? "Enter a valid email." : undefined,
      estValue: !Number.isFinite(value) || value < 0 ? "Enter an amount in rupees." : undefined,
    };
    setErrors(next);
    if (next.email || next.estValue) return;

    setBusy(true);
    try {
      await api.patch(`/api/leads/${lead.id}`, {
        company: form.company,
        title: form.title,
        phone: form.phone,
        email: form.email,
        estValue: value,
        category: form.category,
        source: form.source,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: form.notes,
      });
      toast("Details saved.", "success");
      onDone(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save details", "error");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 pt-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <Input type="tel" autoFocus value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Company">
          <Input value={form.company} onChange={set("company")} />
        </Field>
        <Field label="Title">
          <Input value={form.title} onChange={set("title")} />
        </Field>
        <Field label="Estimated value" error={errors.estValue}>
          <AmountInput value={form.estValue} onChange={set("estValue")} />
        </Field>
        <Field label="Source">
          <Select value={form.source} onChange={set("source")}>
            {LEAD_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Category">
        <Select value={form.category} onChange={set("category")}>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {formatCategoryLabel(c)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tags" hint="comma separated">
        <Input value={form.tags} onChange={set("tags")} placeholder="collections, pilot" />
      </Field>
      <Field label="Notes">
        <Textarea value={form.notes} onChange={set("notes")} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={busy}>
          Save details
        </Button>
        <Button variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
