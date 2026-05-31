"use client";
import { use, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronRight,
  Plus,
  Mail,
  Phone,
  ArrowRight,
  Receipt,
  Wallet,
  Eye,
  Upload,
  Pencil,
  FileText,
  Download,
  Trash2,
  Archive,
} from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { AuditTimeline } from "@/components/AuditTimeline";
import { AddContactModal, EditContactModal, NewInvoiceModal, LogExpenseModal, UploadDocumentModal, uploadInvoiceFile } from "@/components/accounts/AccountModals";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PageLoader, ErrorState, EmptyState } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import { ACCOUNT_STATUS_META, INVOICE_STATUS_META, DOCUMENT_KIND_META } from "@/lib/constants";
import { formatINR, formatINRCompact, formatBytes, cn } from "@/lib/utils";
import { format } from "date-fns";
import type { AccountDTO, AccountFinance, ContactDTO, InvoiceDTO, ExpenseDTO, ActivityDTO, DocumentDTO, AuditLogDTO } from "@/lib/types";

type Tab = "overview" | "contacts" | "documents" | "invoices" | "expenses" | "activity" | "history";
const TABS: Tab[] = ["overview", "contacts", "documents", "invoices", "expenses", "activity", "history"];

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [addContact, setAddContact] = useState(false);
  const [editContact, setEditContact] = useState<ContactDTO | null>(null);
  const [newInvoice, setNewInvoice] = useState(false);
  const [logExpense, setLogExpense] = useState(false);
  const [uploadDoc, setUploadDoc] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const acc = useApi<{ account: AccountDTO; finance: AccountFinance }>(`/api/accounts/${id}`);
  const contacts = useApi<{ contacts: ContactDTO[] }>(`/api/accounts/${id}/contacts`);
  const documents = useApi<{ documents: DocumentDTO[] }>(`/api/accounts/${id}/documents`);
  const invoices = useApi<{ invoices: InvoiceDTO[] }>(`/api/accounts/${id}/invoices`);
  const expenses = useApi<{ expenses: ExpenseDTO[] }>(`/api/accounts/${id}/expenses`);
  const activity = useApi<{ activities: ActivityDTO[] }>(`/api/accounts/${id}/activity`);
  const history = useApi<{ entries: AuditLogDTO[] }>(`/api/accounts/${id}/audit`);

  function refreshMoney() {
    acc.refresh();
    invoices.refresh();
    expenses.refresh();
    activity.refresh();
    history.refresh();
  }

  async function archiveAccount() {
    if (!confirm("Archive this account? It will be hidden from your lists but can be restored from the Archived view.")) return;
    setArchiving(true);
    try {
      await api.delete(`/api/accounts/${id}`);
      toast("Account archived.", "info");
      router.push("/accounts");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not archive", "error");
      setArchiving(false);
    }
  }

  if (acc.loading) return <PageLoader label="Loading account…" />;
  if (acc.error || !acc.data) return <div className="p-8"><ErrorState message={acc.error ?? "Account not found"} onRetry={acc.refresh} /></div>;

  const account = acc.data.account;
  const finance = acc.data.finance;
  const meta = ACCOUNT_STATUS_META[account.status];

  return (
    <>
      <PageHeader>
        <nav className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
          <Link href="/accounts" className="hover:text-ink">Accounts</Link>
          <ChevronRight className="size-3.5 text-faint" />
          <span className="truncate font-display text-[20px] font-bold tracking-tight text-ink">{account.name}</span>
          <Badge tint={meta.tint} className="ml-1">{meta.label}</Badge>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={archiveAccount} loading={archiving} aria-label="Archive account">
            <Archive className="size-4" /> <span className="hidden sm:inline">Archive</span>
          </Button>
          <Button variant="primary" onClick={() => setAddContact(true)}>
            <Plus className="size-4" /> Add contact
          </Button>
        </div>
      </PageHeader>

      {/* Tabs */}
      <div className="sticky top-[68px] z-10 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "relative px-3.5 py-3 text-[13.5px] font-semibold capitalize transition-colors",
                tab === t ? "text-violet-700" : "text-muted hover:text-ink",
              )}
            >
              {t}
              {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-violet-500" />}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-[1100px]">
          {tab === "overview" && (
            <Overview account={account} finance={finance} contacts={contacts.data?.contacts ?? []} invoices={invoices.data?.invoices ?? []} expenses={expenses.data?.expenses ?? []} onSeeInvoices={() => setTab("invoices")} onSeeExpenses={() => setTab("expenses")} />
          )}
          {tab === "contacts" && <Contacts contacts={contacts.data?.contacts ?? []} loading={contacts.loading} onAdd={() => setAddContact(true)} onEdit={setEditContact} />}
          {tab === "documents" && <Documents accountId={id} documents={documents.data?.documents ?? []} loading={documents.loading} onUpload={() => setUploadDoc(true)} onChanged={() => { documents.refresh(); acc.refresh(); history.refresh(); }} />}
          {tab === "invoices" && <Invoices accountId={id} invoices={invoices.data?.invoices ?? []} finance={finance} loading={invoices.loading} onNew={() => setNewInvoice(true)} onChanged={refreshMoney} />}
          {tab === "expenses" && <Expenses expenses={expenses.data?.expenses ?? []} finance={finance} loading={expenses.loading} onNew={() => setLogExpense(true)} />}
          {tab === "activity" && (activity.loading ? <PageLoader /> : <Card className="p-6"><ActivityTimeline activities={activity.data?.activities ?? []} /></Card>)}
          {tab === "history" && (history.loading ? <PageLoader /> : <Card className="p-6"><AuditTimeline entries={history.data?.entries ?? []} showEntity /></Card>)}
        </div>
      </div>

      <AddContactModal accountId={id} open={addContact} onClose={() => setAddContact(false)} onAdded={() => { contacts.refresh(); acc.refresh(); history.refresh(); }} />
      <EditContactModal
        accountId={id}
        contact={editContact}
        onClose={() => setEditContact(null)}
        onSaved={() => { contacts.refresh(); acc.refresh(); history.refresh(); }}
        onDeleted={() => { contacts.refresh(); acc.refresh(); history.refresh(); }}
      />
      <UploadDocumentModal accountId={id} open={uploadDoc} onClose={() => setUploadDoc(false)} onUploaded={() => { documents.refresh(); acc.refresh(); history.refresh(); }} />
      <NewInvoiceModal accountId={id} open={newInvoice} onClose={() => setNewInvoice(false)} onCreated={refreshMoney} />
      <LogExpenseModal accountId={id} open={logExpense} onClose={() => setLogExpense(false)} onCreated={refreshMoney} />
    </>
  );
}

/* ---------------------------------------------------------------- Overview */

function Overview({ account, finance, contacts, invoices, expenses, onSeeInvoices, onSeeExpenses }: {
  account: AccountDTO; finance: AccountFinance; contacts: ContactDTO[]; invoices: InvoiceDTO[]; expenses: ExpenseDTO[]; onSeeInvoices: () => void; onSeeExpenses: () => void;
}) {
  const others = contacts.filter((c) => !c.isPrimary);
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      {/* Left column */}
      <div className="space-y-5">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-[var(--radius-md)] bg-violet-50 text-violet-600"><Building2 className="size-5" /></span>
            <div className="min-w-0">
              <h2 className="truncate font-display text-[18px] font-bold text-ink">{account.name}</h2>
              {account.domain && <p className="truncate text-[12px] text-faint">{account.domain}</p>}
            </div>
          </div>
          <div className="my-4 border-t border-dashed border-line" />
          <dl className="space-y-2 text-[12.5px]">
            {account.industry && <Meta label="Industry" value={account.industry} />}
            <Meta label="Customer since" value={account.customerSince ? format(new Date(account.customerSince), "MMM yyyy") : "—"} />
            <Meta label="Owner" value={account.ownerName} />
            {account.plan && <Meta label="Plan" value={account.plan} />}
            <Meta label="Value" value={<span className="font-mono font-semibold text-ink tnum">{account.value > 0 ? `${formatINR(account.value)} / mo` : "—"}</span>} />
          </dl>
        </Card>

        {account.primaryContact && (
          <Card className="p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Primary contact</p>
            <div className="flex items-center gap-3">
              <Avatar name={account.primaryContact.name} size={40} />
              <div>
                <p className="text-[14px] font-semibold text-ink">{account.primaryContact.name}</p>
                {account.primaryContact.title && <p className="text-[12px] text-muted">{account.primaryContact.title}</p>}
              </div>
            </div>
          </Card>
        )}

        {others.length > 0 && (
          <Card className="p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Other contacts · {others.length}</p>
            <ul className="space-y-2.5">
              {others.map((c) => (
                <li key={c.id} className="flex items-center gap-2.5">
                  <Avatar name={c.name} size={28} />
                  <span className="text-[13px] font-medium text-ink">{c.name}</span>
                  {c.title && <span className="text-[12px] text-faint">· {c.title}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Right column */}
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Billed" value={finance.billed} />
          <Kpi label="Paid" value={finance.paid} tone="success" />
          <Kpi label="Outstanding" value={finance.outstanding} tone="danger" />
          <Kpi label="Expenses" value={finance.expenses} />
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[15px] font-bold text-ink">Recent invoices</h3>
            <button onClick={onSeeInvoices} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-violet-600 hover:underline">see all <ArrowRight className="size-3.5" /></button>
          </div>
          {invoices.length === 0 ? (
            <p className="py-4 text-[13px] text-muted">No invoices yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {invoices.slice(0, 3).map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 py-2.5">
                  <span className="font-mono text-[13px] font-semibold text-ink">#{inv.number}</span>
                  <span className="text-[12.5px] text-faint">{format(new Date(inv.issuedAt), "MMM dd")}</span>
                  <span className="ml-auto font-mono text-[13px] text-ink-soft tnum">{formatINRCompact(inv.amount)}</span>
                  <Badge tint={INVOICE_STATUS_META[inv.status].tint}>{INVOICE_STATUS_META[inv.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[15px] font-bold text-ink">Recent expenses</h3>
            <button onClick={onSeeExpenses} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-violet-600 hover:underline">see all <ArrowRight className="size-3.5" /></button>
          </div>
          {expenses.length === 0 ? (
            <p className="py-4 text-[13px] text-muted">No expenses yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {expenses.slice(0, 3).map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-[13px] text-ink">{e.vendor || e.category}</span>
                  <Badge tone="neutral">{e.category}</Badge>
                  <span className="ml-auto font-mono text-[13px] text-ink-soft tnum">{formatINRCompact(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-ink-soft">{value}</dd>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <Card className="p-4">
      <p className={cn("font-display text-[24px] font-extrabold leading-none tnum", color)}>{formatINRCompact(value)}</p>
      <p className="mt-1.5 text-[12px] text-muted">{label}</p>
    </Card>
  );
}

/* ---------------------------------------------------------------- Contacts */

function Contacts({ contacts, loading, onAdd, onEdit }: { contacts: ContactDTO[]; loading: boolean; onAdd: () => void; onEdit: (c: ContactDTO) => void }) {
  if (loading) return <PageLoader />;
  if (contacts.length === 0) return <EmptyState icon={<Mail className="size-6" />} title="No contacts" description="Add the people you work with at this account." action={<Button variant="primary" onClick={onAdd}><Plus className="size-4" /> Add contact</Button>} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {contacts.map((c) => (
        <Card key={c.id} className="p-4">
          <div className="flex items-center gap-3">
            <Avatar name={c.name} size={42} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-[14px] font-semibold text-ink">{c.name}</p>
                {c.isPrimary && <Badge tone="violet">Primary</Badge>}
              </div>
              {c.title && <p className="text-[12px] text-muted">{c.title}</p>}
            </div>
            <button
              onClick={() => onEdit(c)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:bg-violet-50 hover:text-violet-700"
              aria-label={`Edit ${c.name}`}
            >
              <Pencil className="size-3.5" /> Edit
            </button>
          </div>
          {(c.email || c.phone) && (
            <div className="mt-3 space-y-1 text-[12.5px] text-ink-soft">
              {c.email && <p className="flex items-center gap-2"><Mail className="size-3.5 text-faint" /> {c.email}</p>}
              {c.phone && <p className="flex items-center gap-2"><Phone className="size-3.5 text-faint" /> {c.phone}</p>}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- Documents */

function Documents({ accountId, documents, loading, onUpload, onChanged }: { accountId: string; documents: DocumentDTO[]; loading: boolean; onUpload: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  function view(docId: string) {
    window.open(`/api/accounts/${accountId}/documents/${docId}`, "_blank", "noopener");
  }

  async function remove(doc: DocumentDTO) {
    if (!confirm(`Archive "${doc.title}"?`)) return;
    setBusyId(doc.id);
    try {
      await api.delete(`/api/accounts/${accountId}/documents/${doc.id}`);
      toast(`${doc.title} archived.`, "info");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not archive", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <PageLoader />;
  return (
    <div>
      <div className="mb-4 flex items-center">
        <p className="text-[13px] text-muted">Proposals & signed agreements for this account.</p>
        <Button variant="primary" className="ml-auto" onClick={onUpload}><Upload className="size-4" /> Upload</Button>
      </div>
      {documents.length === 0 ? (
        <EmptyState icon={<FileText className="size-6" />} title="No documents" description="Upload a proposal or signed agreement to keep it on file." action={<Button variant="primary" onClick={onUpload}><Upload className="size-4" /> Upload document</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {documents.map((d) => {
            const meta = DOCUMENT_KIND_META[d.kind];
            return (
              <Card key={d.id} className="flex items-center gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-canvas text-muted"><FileText className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[14px] font-semibold text-ink">{d.title}</p>
                    <Badge tint={meta.tint}>{meta.label}</Badge>
                  </div>
                  <p className="truncate text-[12px] text-muted">
                    {d.fileName} · {formatBytes(d.fileSize)}{d.uploadedByName ? ` · ${d.uploadedByName}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => view(d.id)} className="rounded-md p-2 text-muted transition-colors hover:bg-violet-50 hover:text-violet-700" aria-label={`Open ${d.title}`}><Download className="size-4" /></button>
                  <button onClick={() => remove(d)} disabled={busyId === d.id} className="rounded-md p-2 text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50" aria-label={`Archive ${d.title}`}><Trash2 className="size-4" /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Invoices */

function Invoices({ invoices, finance, loading, onNew, onChanged }: { accountId: string; invoices: InvoiceDTO[]; finance: AccountFinance; loading: boolean; onNew: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);

  async function act(inv: InvoiceDTO, action: "remind" | "paid") {
    setBusyId(inv.id);
    try {
      if (action === "remind") {
        await api.patch(`/api/invoices/${inv.id}`, { action: "remind" });
        toast(`Reminder sent for #${inv.number}.`, "success");
      } else {
        await api.patch(`/api/invoices/${inv.id}`, { status: "paid" });
        toast(`#${inv.number} marked paid.`, "success");
        onChanged();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  function pickFile(invId: string) {
    uploadTarget.current = invId;
    fileInput.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const invId = uploadTarget.current;
    e.target.value = ""; // allow re-picking the same file later
    if (!file || !invId) return;
    setBusyId(invId);
    try {
      await uploadInvoiceFile(invId, file);
      toast("Invoice file stored.", "success");
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  function viewDoc(invId: string) {
    window.open(`/api/invoices/${invId}/document`, "_blank", "noopener");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip label="Billed" value={finance.billed} />
        <Chip label="Paid" value={finance.paid} tone="success" />
        <Chip label="Outstanding" value={finance.outstanding} tone="danger" />
        <Button variant="primary" className="ml-auto" onClick={onNew}><Plus className="size-4" /> New invoice</Button>
      </div>
      {loading ? <PageLoader /> : invoices.length === 0 ? (
        <EmptyState icon={<Receipt className="size-6" />} title="No invoices" description="Bill this account to start tracking revenue." action={<Button variant="primary" onClick={onNew}><Plus className="size-4" /> New invoice</Button>} />
      ) : (
        <Card className="overflow-hidden">
          <input ref={fileInput} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={onFile} />
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Issued</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Document</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoices.map((inv) => (
                <tr key={inv.id} className="text-[13px]">
                  <td className="px-5 py-3.5 font-mono font-semibold text-ink">#{inv.number}</td>
                  <td className="px-5 py-3.5 text-muted">{format(new Date(inv.issuedAt), "MMM dd, yyyy")}</td>
                  <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink tnum">{formatINR(inv.amount)}</td>
                  <td className="px-5 py-3.5 text-muted">{inv.dueAt ? format(new Date(inv.dueAt), "MMM dd") : "—"}</td>
                  <td className="px-5 py-3.5"><Badge tint={INVOICE_STATUS_META[inv.status].tint}>{INVOICE_STATUS_META[inv.status].label}</Badge></td>
                  <td className="px-5 py-3.5">
                    {inv.hasFile ? (
                      <div className="flex items-center gap-2.5">
                        <button onClick={() => viewDoc(inv.id)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-violet-600 hover:underline">
                          <Eye className="size-3.5" /> View
                        </button>
                        <button disabled={busyId === inv.id} onClick={() => pickFile(inv.id)} className="text-[12px] text-faint hover:text-ink disabled:opacity-50" title="Replace file">replace</button>
                      </div>
                    ) : (
                      <button disabled={busyId === inv.id} onClick={() => pickFile(inv.id)} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-violet-600 hover:underline disabled:opacity-50">
                        <Upload className="size-3.5" /> Upload
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {inv.status === "overdue" ? (
                      <button disabled={busyId === inv.id} onClick={() => act(inv, "remind")} className="text-[12.5px] font-semibold text-violet-600 hover:underline disabled:opacity-50">remind</button>
                    ) : inv.status === "sent" ? (
                      <button disabled={busyId === inv.id} onClick={() => act(inv, "paid")} className="text-[12.5px] font-semibold text-violet-600 hover:underline disabled:opacity-50">mark paid</button>
                    ) : (
                      <span className="text-[12.5px] text-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Expenses */

function Expenses({ expenses, finance, loading, onNew }: { expenses: ExpenseDTO[]; finance: AccountFinance; loading: boolean; onNew: () => void }) {
  const thisMonth = useMemo(() => {
    const m = new Date().getMonth();
    const y = new Date().getFullYear();
    return expenses.filter((e) => { const d = new Date(e.date); return d.getMonth() === m && d.getFullYear() === y; }).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip label="This month" value={thisMonth} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[12.5px] font-semibold text-violet-700">
          Margin <span className="tnum">{Math.round(finance.margin * 100)}%</span>
        </span>
        <Button variant="primary" className="ml-auto" onClick={onNew}><Plus className="size-4" /> Log expense</Button>
      </div>
      {loading ? <PageLoader /> : expenses.length === 0 ? (
        <EmptyState icon={<Wallet className="size-6" />} title="No expenses" description="Log costs to see true margin on this account." action={<Button variant="primary" onClick={onNew}><Plus className="size-4" /> Log expense</Button>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Vendor / note</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-center">Billable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {expenses.map((e) => (
                <tr key={e.id} className="text-[13px]">
                  <td className="px-5 py-3.5 text-muted">{format(new Date(e.date), "MMM dd")}</td>
                  <td className="px-5 py-3.5"><Badge tone="neutral">{e.category}</Badge></td>
                  <td className="px-5 py-3.5 text-ink-soft">{e.vendor || "—"}</td>
                  <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink tnum">{formatINR(e.amount)}</td>
                  <td className="px-5 py-3.5 text-center">
                    {e.billable ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink-soft";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[12.5px] font-medium text-muted shadow-[var(--shadow-card)]">
      {label} <span className={cn("font-mono font-semibold tnum", color)}>{formatINRCompact(value)}</span>
    </span>
  );
}
