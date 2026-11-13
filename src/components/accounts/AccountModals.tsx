"use client";
import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Paperclip } from "lucide-react";
import { Drawer, Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { AmountInput, Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/client";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_META,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_META,
  EXPENSE_CATEGORIES,
  INVOICE_STATUSES,
  INVOICE_STATUS_META,
} from "@/lib/constants";
import { cn, formatBytes, parseAmount } from "@/lib/utils";
import type { AccountDTO, ContactDTO, DocumentDTO, ExpenseDTO, InvoiceDTO } from "@/lib/types";

/* Every modal here is mounted only while open (`{open && <XModal … />}`), so
   its form state starts fresh each time and needs no reset logic. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------ form parts */

/** `<form>` body: fields stacked, then the action row. Enter submits. */
function FormBody({
  onSubmit,
  submitLabel,
  busy,
  onCancel,
  extra,
  children,
}: {
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
  onCancel: () => void;
  /** Right-aligned secondary action, e.g. Remove. */
  extra?: ReactNode;
  children: ReactNode;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {children}
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" variant="primary" loading={busy}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {extra && <div className="ml-auto">{extra}</div>}
      </div>
    </form>
  );
}

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-ink-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-accent" />
      {children}
    </label>
  );
}

/** File picker styled as a dashed drop target. The real input stays focusable. */
function FilePicker({
  id,
  file,
  onPick,
  placeholder,
  accept,
  invalid,
}: {
  id?: string;
  file: File | null;
  onPick: (f: File | null) => void;
  placeholder: string;
  accept: string;
  invalid?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-control border border-dashed bg-control px-3 py-2.5 transition-colors hover:bg-hover",
        "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-tint",
        invalid ? "border-overdue" : "border-line-strong",
      )}
    >
      <input id={id} type="file" accept={accept} className="sr-only" aria-invalid={invalid || undefined} onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <Paperclip className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
      <span className={cn("min-w-0 flex-1 truncate", file ? "text-ink-1" : "text-ink-3")}>{file ? file.name : placeholder}</span>
      {file && <span className="tnum shrink-0 text-[12px] text-ink-3">{formatBytes(file.size)}</span>}
    </label>
  );
}

/* --------------------------------------------------------- contact fields */

interface ContactForm {
  name: string;
  title: string;
  email: string;
  phone: string;
}
type ContactErrors = Partial<Record<"name" | "email", string>>;

function validateContact(c: ContactForm, nameRequired: boolean): ContactErrors {
  const errors: ContactErrors = {};
  if (nameRequired && !c.name.trim()) errors.name = "Contact name is required.";
  if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) errors.email = "Enter a valid email address.";
  return errors;
}

/** Name / title / phone / email, shared by the contact modal and the new-account drawer. */
function ContactFields({
  value,
  onChange,
  errors,
  nameRef,
  emailRef,
  autoFocus,
  nameRequired,
}: {
  value: ContactForm;
  onChange: (patch: Partial<ContactForm>) => void;
  errors: ContactErrors;
  nameRef: RefObject<HTMLInputElement | null>;
  emailRef: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  nameRequired?: boolean;
}) {
  return (
    <>
      <Field label="Name" required={nameRequired} error={errors.name}>
        <Input ref={nameRef} autoFocus={autoFocus} autoComplete="off" value={value.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label="Title" hint="optional">
        <Input placeholder="Finance head" value={value.title} onChange={(e) => onChange({ title: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phone">
          <Input type="tel" value={value.phone} onChange={(e) => onChange({ phone: e.target.value })} />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input ref={emailRef} type="email" value={value.email} onChange={(e) => onChange({ email: e.target.value })} />
        </Field>
      </div>
    </>
  );
}

/** Contact form state + validation that focuses the first bad field. */
function useContactForm(initial: ContactForm, nameRequired: boolean) {
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<ContactErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const onChange = (patch: Partial<ContactForm>) => {
    setValue((v) => ({ ...v, ...patch }));
    setErrors((e) => ({ ...e, ...("name" in patch && { name: undefined }), ...("email" in patch && { email: undefined }) }));
  };
  const validate = () => {
    const next = validateContact(value, nameRequired);
    setErrors(next);
    if (next.name) nameRef.current?.focus();
    else if (next.email) emailRef.current?.focus();
    return !next.name && !next.email;
  };
  return { value, errors, validate, fields: { value, onChange, errors, nameRef, emailRef, nameRequired } };
}

const EMPTY_CONTACT: ContactForm = { name: "", title: "", email: "", phone: "" };

/* ----------------------------------------------------------- new account */

export function NewAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: (a: AccountDTO) => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ name: "", domain: "", industry: "", plan: "", value: "", status: "active" });
  const [nameError, setNameError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const contact = useContactForm(EMPTY_CONTACT, false);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));

  async function submit() {
    const nameOk = Boolean(f.name.trim());
    setNameError(nameOk ? undefined : "Account name is required.");
    if (!nameOk) {
      nameRef.current?.focus();
      return;
    }
    if (!contact.validate()) return;
    setBusy(true);
    try {
      const c = contact.value;
      const { account } = await api.post<{ account: AccountDTO }>("/api/accounts", {
        ...f,
        value: parseAmount(f.value),
        contactName: c.name,
        contactTitle: c.title,
        contactEmail: c.email,
        contactPhone: c.phone,
      });
      toast(`${account.name} created.`, "success");
      onCreated(account);
      onClose();
    } catch (e) {
      toast(errorMessage(e, "Could not create the account"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title="New account" subtitle="Create an account directly, or convert a won lead to carry its history over.">
      <FormBody onSubmit={submit} submitLabel="Create account" busy={busy} onCancel={onClose}>
        <Field label="Account name" required error={nameError}>
          <Input
            ref={nameRef}
            autoFocus
            placeholder="Acme Logistics"
            value={f.name}
            onChange={(e) => {
              set({ name: e.target.value });
              setNameError(undefined);
            }}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Domain">
            <Input placeholder="acme.in" value={f.domain} onChange={(e) => set({ domain: e.target.value })} />
          </Field>
          <Field label="Industry">
            <Input placeholder="Logistics" value={f.industry} onChange={(e) => set({ industry: e.target.value })} />
          </Field>
          <Field label="Plan" hint="optional">
            <Input placeholder="Starter" value={f.plan} onChange={(e) => set({ plan: e.target.value })} />
          </Field>
          <Field label="Value a month">
            <AmountInput placeholder="85,000" value={f.value} onChange={(e) => set({ value: e.target.value })} />
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set({ status: e.target.value })}>
              {ACCOUNT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ACCOUNT_STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset className="flex flex-col gap-4 border-t border-line pt-4">
          <legend className="float-left mb-3 w-full text-[14px] font-semibold text-ink-1">
            Primary contact <span className="font-normal text-ink-3">optional</span>
          </legend>
          <ContactFields {...contact.fields} />
        </fieldset>
      </FormBody>
    </Drawer>
  );
}

/* ---------------------------------------------------------------- contact */

/** Add a contact (no `contact`) or edit one, including promote-to-primary and remove. */
export function ContactModal({
  accountId,
  contact,
  onClose,
  onChanged,
}: {
  accountId: string;
  contact?: ContactDTO;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const form = useContactForm(contact ? { name: contact.name, title: contact.title, email: contact.email, phone: contact.phone } : EMPTY_CONTACT, true);
  const [makePrimary, setMakePrimary] = useState(false);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const base = `/api/accounts/${accountId}/contacts`;

  async function save() {
    if (!form.validate()) return;
    setBusy("save");
    try {
      if (contact) {
        const body = { ...form.value, ...(makePrimary && { isPrimary: true }) };
        const res = await api.patch<{ contact: ContactDTO }>(`${base}/${contact.id}`, body);
        toast(`${res.contact.name} updated.`, "success");
      } else {
        const res = await api.post<{ contact: ContactDTO }>(base, form.value);
        toast(`${res.contact.name} added.`, "success");
      }
      onChanged();
      onClose();
    } catch (e) {
      toast(errorMessage(e, "Could not save the contact"), "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!contact) return;
    const ok = await confirm({
      title: `Remove ${contact.name}?`,
      description: "They will be taken off this account. If they were the primary contact, the next contact takes over.",
      confirmLabel: "Remove contact",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("remove");
    try {
      await api.delete(`${base}/${contact.id}`);
      toast(`${contact.name} removed.`, "info");
      onChanged();
      onClose();
    } catch (e) {
      toast(errorMessage(e, "Could not remove the contact"), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm" title={contact ? "Edit contact" : "Add contact"} subtitle={contact ? undefined : "Another person at this account."}>
      <FormBody
        onSubmit={save}
        submitLabel={contact ? "Save changes" : "Add contact"}
        busy={busy === "save"}
        onCancel={onClose}
        extra={
          contact && (
            <Button type="button" variant="danger" onClick={remove} loading={busy === "remove"}>
              Remove
            </Button>
          )
        }
      >
        <ContactFields {...form.fields} autoFocus />
        {contact &&
          (contact.isPrimary ? (
            <p className="text-[13px] text-ink-3">This is the account&apos;s primary contact.</p>
          ) : (
            <CheckRow checked={makePrimary} onChange={setMakePrimary}>
              Make primary contact
            </CheckRow>
          ))}
      </FormBody>
    </Modal>
  );
}

/* ---------------------------------------------------------------- uploads */

/** POST multipart form data; surfaces the API's error message (e.g. the 501 when storage is off). */
async function postForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Upload failed");
  return data as T;
}

/** Store an externally generated invoice file (PDF or image) against an invoice. */
export async function uploadInvoiceFile(invoiceId: string, file: File): Promise<InvoiceDTO> {
  const fd = new FormData();
  fd.append("file", file);
  return (await postForm<{ invoice: InvoiceDTO }>(`/api/invoices/${invoiceId}/document`, fd)).invoice;
}

export const INVOICE_FILE_TYPES = "application/pdf,image/png,image/jpeg";
const DOCUMENT_FILE_TYPES = `${INVOICE_FILE_TYPES},application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document`;

export function UploadDocumentModal({ accountId, onClose, onUploaded }: { accountId: string; onClose: () => void; onUploaded: (d: DocumentDTO) => void }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<string>("proposal");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!file) {
      setFileError("Attach a file to upload.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      fd.append("title", title.trim() || file.name);
      const { document } = await postForm<{ document: DocumentDTO }>(`/api/accounts/${accountId}/documents`, fd);
      toast(`${document.title} uploaded.`, "success");
      onUploaded(document);
      onClose();
    } catch (e) {
      toast(errorMessage(e, "Could not upload"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm" title="Upload document" subtitle="Keep a proposal or signed agreement on this account.">
      <FormBody onSubmit={submit} submitLabel="Upload" busy={busy} onCancel={onClose}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DOCUMENT_KIND_META[k].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" hint="optional">
            <Input placeholder="Service agreement 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <Field label="File" required hint="PDF, Word, PNG or JPEG, up to 25 MB" error={fileError}>
          <FilePicker
            file={file}
            onPick={(f) => {
              setFile(f);
              setFileError(undefined);
            }}
            invalid={Boolean(fileError)}
            placeholder="Choose the proposal or agreement"
            accept={DOCUMENT_FILE_TYPES}
          />
        </Field>
      </FormBody>
    </Modal>
  );
}

/* ---------------------------------------------------------------- invoice */

/** Amount field state with a "greater than zero" check that focuses the input. */
function useAmount(initial = "") {
  const [raw, setRaw] = useState(initial);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  return {
    value: parseAmount(raw),
    validate() {
      const ok = parseAmount(raw) > 0;
      setError(ok ? undefined : "Enter an amount greater than zero.");
      if (!ok) inputRef.current?.focus();
      return ok;
    },
    props: { raw, setRaw, error, setError, inputRef },
  };
}

function AmountField({ raw, setRaw, error, setError, inputRef }: ReturnType<typeof useAmount>["props"]) {
  return (
    <Field label="Amount" required error={error}>
      <AmountInput
        ref={inputRef}
        autoFocus
        placeholder="1,10,000"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setError(undefined);
        }}
      />
    </Field>
  );
}

export function NewInvoiceModal({ accountId, onClose, onCreated }: { accountId: string; onClose: () => void; onCreated: (i: InvoiceDTO) => void }) {
  const { toast } = useToast();
  const amount = useAmount();
  const [status, setStatus] = useState("sent");
  const [dueAt, setDueAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!amount.validate()) return;
    setBusy(true);
    try {
      const { invoice } = await api.post<{ invoice: InvoiceDTO }>(`/api/accounts/${accountId}/invoices`, {
        amount: amount.value,
        status,
        dueAt: dueAt || undefined,
      });
      if (file) {
        try {
          await uploadInvoiceFile(invoice.id, file);
          toast(`Invoice #${invoice.number} created with its file.`, "success");
        } catch (uploadErr) {
          toast(`Invoice #${invoice.number} created, but the file did not upload: ${errorMessage(uploadErr, "error")}`, "error");
        }
      } else {
        toast(`Invoice #${invoice.number} created.`, "success");
      }
      onCreated(invoice);
      onClose();
    } catch (e) {
      toast(errorMessage(e, "Could not create the invoice"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm" title="New invoice" subtitle="Numbered automatically. Due in 14 days unless you set a date.">
      <FormBody onSubmit={submit} submitLabel="Create invoice" busy={busy} onCancel={onClose}>
        <AmountField {...amount.props} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {INVOICE_STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" hint="optional">
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Invoice file" hint="PDF, PNG or JPEG, optional">
          <FilePicker file={file} onPick={setFile} placeholder="Attach the generated invoice" accept={INVOICE_FILE_TYPES} />
        </Field>
      </FormBody>
    </Modal>
  );
}

/* ---------------------------------------------------------------- expense */

/** Log an expense (no `expense`) or edit one, including remove. */
export function ExpenseModal({
  accountId,
  expense,
  onClose,
  onChanged,
}: {
  accountId: string;
  expense?: ExpenseDTO;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const amount = useAmount(expense ? String(expense.amount) : "");
  const [f, setF] = useState({
    category: expense?.category ?? "Software",
    vendor: expense?.vendor ?? "",
    date: expense ? expense.date.slice(0, 10) : today(),
    billable: expense?.billable ?? false,
  });
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));
  const base = `/api/accounts/${accountId}/expenses`;

  async function save() {
    if (!amount.validate()) return;
    setBusy("save");
    try {
      const body = { ...f, amount: amount.value, date: f.date || undefined };
      if (expense) await api.patch(`${base}/${expense.id}`, body);
      else await api.post(base, body);
      toast(expense ? "Expense updated." : "Expense logged.", "success");
      onChanged();
      onClose();
    } catch (e) {
      toast(errorMessage(e, "Could not save the expense"), "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!expense) return;
    const ok = await confirm({
      title: "Remove this expense?",
      description: "It drops out of the account's costs and margin.",
      confirmLabel: "Remove expense",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("remove");
    try {
      await api.delete(`${base}/${expense.id}`);
      toast("Expense removed.", "info");
      onChanged();
      onClose();
    } catch (e) {
      toast(errorMessage(e, "Could not remove the expense"), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm" title={expense ? "Edit expense" : "Log expense"} subtitle={expense ? undefined : "Record a cost so the margin is real."}>
      <FormBody
        onSubmit={save}
        submitLabel={expense ? "Save changes" : "Log expense"}
        busy={busy === "save"}
        onCancel={onClose}
        extra={
          expense && (
            <Button type="button" variant="danger" onClick={remove} loading={busy === "remove"}>
              Remove
            </Button>
          )
        }
      >
        <AmountField {...amount.props} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select value={f.category} onChange={(e) => set({ category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
        </div>
        <Field label="Vendor or note">
          <Input placeholder="Twilio call minutes" value={f.vendor} onChange={(e) => set({ vendor: e.target.value })} />
        </Field>
        <CheckRow checked={f.billable} onChange={(billable) => set({ billable })}>
          Billable to the client
        </CheckRow>
      </FormBody>
    </Modal>
  );
}
