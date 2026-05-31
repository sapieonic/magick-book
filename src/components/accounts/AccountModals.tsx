"use client";
import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_META, EXPENSE_CATEGORIES, INVOICE_STATUSES, INVOICE_STATUS_META, DOCUMENT_KINDS, DOCUMENT_KIND_META } from "@/lib/constants";
import type { AccountDTO, ContactDTO, InvoiceDTO, ExpenseDTO, DocumentDTO } from "@/lib/types";

/* ---------------------------------------------------------- New account */

export function NewAccountModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (a: AccountDTO) => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", domain: "", industry: "", value: "", status: "active", contactName: "", contactTitle: "", contactEmail: "", contactPhone: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    if (!f.name.trim()) return toast("Account name is required.", "error");
    setBusy(true);
    try {
      const { account } = await api.post<{ account: AccountDTO }>("/api/accounts", { ...f, value: Number(String(f.value).replace(/[^\d.]/g, "")) || 0 });
      toast(`${account.name} created.`, "success");
      onCreated(account);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="New account" subtitle="Spin up an account directly — or convert a won lead to carry history over.">
      <div className="space-y-4">
        <Field label="Account name" required>
          <Input autoFocus placeholder="Acme Logistics" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Domain"><Input placeholder="acme.in" value={f.domain} onChange={(e) => set("domain", e.target.value)} /></Field>
          <Field label="Industry"><Input placeholder="Logistics" value={f.industry} onChange={(e) => set("industry", e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Value / month" hint="₹/mo">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[14px] text-muted">₹</span>
              <Input className="pl-7 font-mono tnum" inputMode="numeric" placeholder="85,000" value={f.value} onChange={(e) => set("value", e.target.value)} />
            </div>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
              {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{ACCOUNT_STATUS_META[s].label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="rounded-[var(--radius-md)] border border-line bg-canvas/50 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Primary contact (optional)</p>
          <div className="space-y-3">
            <Input placeholder="Contact name" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Title" value={f.contactTitle} onChange={(e) => set("contactTitle", e.target.value)} />
              <Input placeholder="Phone" value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
            </div>
            <Input type="email" placeholder="email@company" value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="primary" onClick={submit} loading={busy}>Create account</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- Add contact */

export function AddContactModal({ accountId, open, onClose, onAdded }: { accountId: string; open: boolean; onClose: () => void; onAdded: (c: ContactDTO) => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", title: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  if (!open) return null;

  async function submit() {
    if (!f.name.trim()) return toast("Contact name is required.", "error");
    setBusy(true);
    try {
      const { contact } = await api.post<{ contact: ContactDTO }>(`/api/accounts/${accountId}/contacts`, f);
      toast(`${contact.name} added.`, "success");
      onAdded(contact);
      onClose();
      setF({ name: "", title: "", email: "", phone: "" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add contact" subtitle="Another person at this account." size="sm">
      <div className="space-y-3">
        <Input autoFocus placeholder="Name" value={f.name} onChange={(e) => set("name", e.target.value)} />
        <Input placeholder="Title (e.g. Finance)" value={f.title} onChange={(e) => set("title", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          <Input type="email" placeholder="Email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="primary" onClick={submit} loading={busy}>Add contact</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- Edit contact */

export function EditContactModal({
  accountId,
  contact,
  onClose,
  onSaved,
  onDeleted,
}: {
  accountId: string;
  contact: ContactDTO | null;
  onClose: () => void;
  onSaved: (c: ContactDTO) => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", title: "", email: "", phone: "", makePrimary: false });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  // Re-seed the form whenever a different contact is opened.
  useEffect(() => {
    if (contact) setF({ name: contact.name, title: contact.title ?? "", email: contact.email ?? "", phone: contact.phone ?? "", makePrimary: false });
  }, [contact]);

  if (!contact) return null;

  async function submit() {
    if (!contact) return;
    if (!f.name.trim()) return toast("Contact name is required.", "error");
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: f.name, title: f.title, email: f.email, phone: f.phone };
      if (f.makePrimary && !contact.isPrimary) body.isPrimary = true;
      const { contact: updated } = await api.patch<{ contact: ContactDTO }>(`/api/accounts/${accountId}/contacts/${contact.id}`, body);
      toast(`${updated.name} updated.`, "success");
      onSaved(updated);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!contact) return;
    setDeleting(true);
    try {
      await api.delete(`/api/accounts/${accountId}/contacts/${contact.id}`);
      toast(`${contact.name} removed.`, "info");
      onDeleted(contact.id);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not remove", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit contact" subtitle={`Update ${contact.name}'s details.`} size="sm">
      <div className="space-y-3">
        <Input autoFocus placeholder="Name" value={f.name} onChange={(e) => set("name", e.target.value)} />
        <Input placeholder="Title (e.g. Finance)" value={f.title} onChange={(e) => set("title", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          <Input type="email" placeholder="Email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        {contact.isPrimary ? (
          <p className="text-[12px] font-medium text-muted">This is the primary contact for the account.</p>
        ) : (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-line bg-canvas/50 px-3.5 py-2.5">
            <input type="checkbox" checked={f.makePrimary} onChange={(e) => set("makePrimary", e.target.checked)} className="size-4 accent-violet-600" />
            <span className="text-[13px] font-medium text-ink-soft">Make primary contact</span>
          </label>
        )}
        <div className="flex items-center gap-3 pt-1">
          <Button variant="primary" onClick={submit} loading={busy}>Save changes</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" className="ml-auto" onClick={remove} loading={deleting}>Remove</Button>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------- Upload document */

/** Upload an account document (proposal/agreement) to S3 via the API. */
export async function uploadAccountDocument(accountId: string, file: File, kind: string, title: string): Promise<DocumentDTO> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  fd.append("title", title);
  const res = await fetch(`/api/accounts/${accountId}/documents`, { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Upload failed");
  return data.document as DocumentDTO;
}

export function UploadDocumentModal({ accountId, open, onClose, onUploaded }: { accountId: string; open: boolean; onClose: () => void; onUploaded: (d: DocumentDTO) => void }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<string>("proposal");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  function reset() {
    setKind("proposal");
    setTitle("");
    setFile(null);
  }

  async function submit() {
    if (!file) return toast("Attach a file.", "error");
    setBusy(true);
    try {
      const doc = await uploadAccountDocument(accountId, file, kind, title.trim() || file.name);
      toast(`${doc.title} uploaded.`, "success");
      onUploaded(doc);
      onClose();
      reset();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not upload", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Upload document" subtitle="Store a proposal or signed agreement on this account." size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{DOCUMENT_KIND_META[k].label}</option>)}
            </Select>
          </Field>
          <Field label="Title" hint="optional">
            <Input placeholder="MSA 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <Field label="File" hint="PDF/DOC/PNG/JPEG · max 25 MB">
          <FileDrop file={file} onPick={setFile} label="Attach the proposal or agreement" accept="application/pdf,image/png,image/jpeg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        </Field>
        <div className="flex gap-3 pt-1">
          <Button variant="primary" onClick={submit} loading={busy}>Upload</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- New invoice */

export function NewInvoiceModal({ accountId, open, onClose, onCreated }: { accountId: string; open: boolean; onClose: () => void; onCreated: (i: InvoiceDTO) => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("sent");
  const [dueAt, setDueAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  function reset() {
    setAmount("");
    setDueAt("");
    setFile(null);
    setStatus("sent");
  }

  async function submit() {
    const amt = Number(String(amount).replace(/[^\d.]/g, ""));
    if (!amt) return toast("Enter an amount.", "error");
    setBusy(true);
    try {
      const { invoice } = await api.post<{ invoice: InvoiceDTO }>(`/api/accounts/${accountId}/invoices`, { amount: amt, status, dueAt: dueAt || undefined });

      // Persist the externally-generated invoice file to S3, if one was attached.
      if (file) {
        try {
          await uploadInvoiceFile(invoice.id, file);
          toast(`Invoice #${invoice.number} created & file stored.`, "success");
        } catch (uploadErr) {
          toast(`Invoice #${invoice.number} created, but the file didn't upload: ${uploadErr instanceof Error ? uploadErr.message : "error"}`, "error");
        }
      } else {
        toast(`Invoice #${invoice.number} created.`, "success");
      }

      onCreated(invoice);
      onClose();
      reset();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New invoice" subtitle="We'll number it automatically." size="sm">
      <div className="space-y-4">
        <Field label="Amount" required>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[14px] text-muted">₹</span>
            <Input autoFocus className="pl-7 font-mono tnum" inputMode="numeric" placeholder="1,10,000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_STATUS_META[s].label}</option>)}
            </Select>
          </Field>
          <Field label="Due date" hint="optional">
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Invoice file" hint="PDF/PNG/JPEG · optional">
          <FileDrop file={file} onPick={setFile} />
        </Field>
        <div className="flex gap-3 pt-1">
          <Button variant="primary" onClick={submit} loading={busy}>Create invoice</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Upload an externally-generated invoice file to S3 via the API. */
export async function uploadInvoiceFile(invoiceId: string, file: File): Promise<InvoiceDTO> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/invoices/${invoiceId}/document`, { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Upload failed");
  return data.invoice as InvoiceDTO;
}

function FileDrop({
  file,
  onPick,
  label = "Attach the generated invoice (PDF)",
  accept = "application/pdf,image/png,image/jpeg",
}: {
  file: File | null;
  onPick: (f: File | null) => void;
  label?: string;
  accept?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-line-strong bg-canvas/50 px-3.5 py-3 transition-colors hover:border-violet-400">
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <Paperclip className="size-4 shrink-0 text-muted" />
      <span className="truncate text-[13px] text-ink-soft">
        {file ? file.name : label}
      </span>
      {file && <span className="ml-auto text-[11.5px] text-faint">{(file.size / 1024).toFixed(0)} KB</span>}
    </label>
  );
}

/* ---------------------------------------------------------- Log expense */

export function LogExpenseModal({ accountId, open, onClose, onCreated }: { accountId: string; open: boolean; onClose: () => void; onCreated: (e: ExpenseDTO) => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ amount: "", category: "Software", vendor: "", billable: false });
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function submit() {
    const amt = Number(String(f.amount).replace(/[^\d.]/g, ""));
    if (!amt) return toast("Enter an amount.", "error");
    setBusy(true);
    try {
      const { expense } = await api.post<{ expense: ExpenseDTO }>(`/api/accounts/${accountId}/expenses`, { ...f, amount: amt });
      toast("Expense logged.", "success");
      onCreated(expense);
      onClose();
      setF({ amount: "", category: "Software", vendor: "", billable: false });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not log", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Log expense" subtitle="Track cost so you see true margin." size="sm">
      <div className="space-y-4">
        <Field label="Amount" required>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[14px] text-muted">₹</span>
            <Input autoFocus className="pl-7 font-mono tnum" inputMode="numeric" placeholder="6,200" value={f.amount} onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))} />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={f.category} onChange={(e) => setF((s) => ({ ...s, category: e.target.value }))}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Vendor / note">
            <Input placeholder="Twilio call minutes" value={f.vendor} onChange={(e) => setF((s) => ({ ...s, vendor: e.target.value }))} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-line bg-canvas/50 px-3.5 py-2.5">
          <input type="checkbox" checked={f.billable} onChange={(e) => setF((s) => ({ ...s, billable: e.target.checked }))} className="size-4 accent-violet-600" />
          <span className="text-[13px] font-medium text-ink-soft">Billable to the client</span>
        </label>
        <div className="flex gap-3 pt-1">
          <Button variant="primary" onClick={submit} loading={busy}>Log expense</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
