"use client";
import { useState, type ReactNode } from "react";
import { FileText, Mail, Plus, Receipt, Upload, Wallet } from "lucide-react";
import { Badge, Tag } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/Misc";
import { Money, formatMoney } from "@/components/ui/Money";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th, TwoLine } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { DOCUMENT_KIND_META } from "@/lib/constants";
import type { AccountFinance, ContactDTO, DocumentDTO, ExpenseDTO, InvoiceDTO } from "@/lib/types";
import { documentMeta, openDocument } from "./AccountRail";
import { RowsSkeleton } from "./parts";
import { InvoiceNumber, InvoiceStatus } from "./StatementTable";
import { longDate } from "./statement";
import { useInvoiceActions } from "./useInvoiceActions";

const icon = (Icon: typeof Mail) => <Icon className="size-6" strokeWidth={1.5} />;
const plus = <Plus className="size-4" strokeWidth={1.5} aria-hidden />;

/** A tab's panel: header with an add action, then a skeleton, empty state or the table. */
function Section({
  title,
  meta,
  addLabel,
  onAdd,
  loading,
  empty,
  children,
}: {
  title: string;
  meta?: ReactNode;
  addLabel: string;
  onAdd: () => void;
  loading: boolean;
  empty: { icon: ReactNode; title: string; description: string } | null;
  children: ReactNode;
}) {
  const add = (variant: "primary" | "secondary") => (
    <Button variant={variant} size={variant === "secondary" ? "sm" : "md"} onClick={onAdd}>
      {plus} {addLabel}
    </Button>
  );
  return (
    <Panel title={title} meta={meta} actions={!loading && !empty && add("secondary")}>
      {loading ? <RowsSkeleton /> : empty ? <EmptyState {...empty} action={add("primary")} /> : children}
    </Panel>
  );
}

/* --------------------------------------------------------------- contacts */

export function ContactsSection({ contacts, loading, onAdd, onEdit }: { contacts: ContactDTO[]; loading: boolean; onAdd: () => void; onEdit: (c: ContactDTO) => void }) {
  return (
    <Section
      title="Contacts"
      meta={contacts.length || undefined}
      addLabel="Add contact"
      onAdd={onAdd}
      loading={loading}
      empty={contacts.length ? null : { icon: icon(Mail), title: "No contacts", description: "Add the people you work with at this account." }}
    >
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th hideOnPhone>Email</Th>
            <Th hideOnPhone>Phone</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id}>
              <Td>
                <TwoLine
                  primary={
                    <span className="flex flex-wrap items-center gap-2">
                      {c.name}
                      {c.isPrimary && <Badge tone="accent">Primary</Badge>}
                    </span>
                  }
                  secondary={[c.title, c.email, c.phone].filter(Boolean).join(" · ") || undefined}
                />
              </Td>
              <Td hideOnPhone>{c.email ? <a className="link" href={`mailto:${c.email}`}>{c.email}</a> : <span className="text-ink-3">–</span>}</Td>
              <Td hideOnPhone className="tnum whitespace-nowrap">
                {c.phone ? <a className="link" href={`tel:${c.phone.replace(/\s+/g, "")}`}>{c.phone}</a> : <span className="text-ink-3">–</span>}
              </Td>
              <Td className="text-right">
                <Button size="sm" variant="ghost" onClick={() => onEdit(c)} aria-label={`Edit ${c.name}`}>
                  Edit
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Section>
  );
}

/* -------------------------------------------------------------- documents */

export function DocumentsSection({
  accountId,
  documents,
  loading,
  onUpload,
  onChanged,
}: {
  accountId: string;
  documents: DocumentDTO[];
  loading: boolean;
  onUpload: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function archive(doc: DocumentDTO) {
    const ok = await confirm({
      title: `Archive "${doc.title}"?`,
      description: "It leaves this account and can be restored later.",
      confirmLabel: "Archive document",
      tone: "danger",
    });
    if (!ok) return;
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

  return (
    <Section
      title="Documents"
      meta="proposals and signed agreements"
      addLabel="Upload"
      onAdd={onUpload}
      loading={loading}
      empty={documents.length ? null : { icon: icon(FileText), title: "No documents", description: "Upload a proposal or signed agreement to keep it on file." }}
    >
      <Table>
        <thead>
          <tr>
            <Th>Document</Th>
            <Th hideOnPhone>Type</Th>
            <Th hideOnPhone>File</Th>
            <Th hideOnPhone>Added</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id}>
              <Td>
                <TwoLine primary={d.title} secondary={documentMeta(d)} phoneOnly />
              </Td>
              <Td hideOnPhone>
                <Tag>{DOCUMENT_KIND_META[d.kind].label}</Tag>
              </Td>
              <Td hideOnPhone className="max-w-[240px] truncate text-ink-2">
                {d.fileName}
              </Td>
              <Td hideOnPhone className="tnum whitespace-nowrap text-ink-2">
                {longDate(d.createdAt)}
                {d.uploadedByName && <span className="text-ink-3"> · {d.uploadedByName}</span>}
              </Td>
              <Td className="whitespace-nowrap text-right">
                <span className="inline-flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openDocument(accountId, d.id)} aria-label={`Open ${d.title}`}>
                    Open
                  </Button>
                  <Button size="sm" variant="ghost" loading={busyId === d.id} onClick={() => archive(d)} aria-label={`Archive ${d.title}`}>
                    Archive
                  </Button>
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Section>
  );
}

/* --------------------------------------------------------------- invoices */

export function InvoicesSection({
  invoices,
  finance,
  loading,
  onNew,
  onChanged,
}: {
  invoices: InvoiceDTO[];
  finance: AccountFinance;
  loading: boolean;
  onNew: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const actions = useInvoiceActions(onChanged);
  return (
    <Section
      title="Invoices"
      meta={`${formatMoney(finance.billed)} billed · ${formatMoney(finance.outstanding)} outstanding`}
      addLabel="New invoice"
      onAdd={onNew}
      loading={loading}
      empty={invoices.length ? null : { icon: icon(Receipt), title: "No invoices", description: "Bill this account to start tracking revenue." }}
    >
      <input {...actions.fileInputProps} />
      <Table>
        <thead>
          <tr>
            <Th>Invoice</Th>
            <Th hideOnPhone>Issued</Th>
            <Th hideOnPhone>Due</Th>
            <Th numeric>Amount</Th>
            <Th hideOnPhone>Status</Th>
            <Th hideOnPhone>File</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const busy = actions.busyId === inv.id;
            return (
              <tr key={inv.id}>
                <Td>
                  <TwoLine primary={<InvoiceNumber n={inv.number} />} secondary={<InvoiceStatus invoice={inv} />} phoneOnly />
                </Td>
                <Td hideOnPhone className="tnum whitespace-nowrap text-ink-2">
                  {longDate(inv.issuedAt)}
                </Td>
                <Td hideOnPhone className="tnum whitespace-nowrap text-ink-2">
                  {inv.dueAt ? longDate(inv.dueAt) : "–"}
                </Td>
                <Td numeric>
                  <Money value={inv.amount} />
                </Td>
                <Td hideOnPhone>
                  <InvoiceStatus invoice={inv} />
                </Td>
                <Td hideOnPhone className="whitespace-nowrap">
                  {inv.hasFile ? (
                    <span className="inline-flex gap-3 text-[13px]">
                      <button type="button" className="link" onClick={() => actions.openFile(inv)} aria-label={`View invoice #${inv.number} file`}>
                        View
                      </button>
                      <button type="button" className="text-ink-3 hover:text-ink-1 disabled:opacity-50" disabled={busy} onClick={() => actions.attachFile(inv)} aria-label={`Replace invoice #${inv.number} file`}>
                        Replace
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="link inline-flex items-center gap-1.5 text-[13px] disabled:opacity-50" disabled={busy} onClick={() => actions.attachFile(inv)} aria-label={`Upload invoice #${inv.number} file`}>
                      <Upload className="size-3.5" strokeWidth={1.5} aria-hidden /> Upload
                    </button>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-right">
                  <span className="inline-flex items-center gap-1">
                    {inv.status === "overdue" && (
                      <Button size="sm" loading={busy} onClick={() => actions.remind(inv)}>
                        Remind
                      </Button>
                    )}
                    {(inv.status === "sent" || inv.status === "overdue") && (
                      <Button size="sm" loading={busy} onClick={() => actions.markPaid(inv)} aria-label={`Mark invoice #${inv.number} paid`}>
                        Mark paid
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => actions.remove(inv)} aria-label={`Remove invoice #${inv.number}`}>
                      Remove
                    </Button>
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Section>
  );
}

/* --------------------------------------------------------------- expenses */

export function ExpensesSection({
  expenses,
  finance,
  loading,
  onNew,
  onEdit,
}: {
  expenses: ExpenseDTO[];
  finance: AccountFinance;
  loading: boolean;
  onNew: () => void;
  onEdit: (e: ExpenseDTO) => void;
}) {
  const now = new Date();
  const thisMonth = expenses
    .filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + e.amount, 0);

  return (
    <Section
      title="Expenses"
      meta={`${formatMoney(thisMonth)} this month · ${Math.round(finance.margin * 100)}% margin`}
      addLabel="Log expense"
      onAdd={onNew}
      loading={loading}
      empty={expenses.length ? null : { icon: icon(Wallet), title: "No expenses", description: "Log costs to see the true margin on this account." }}
    >
      <Table>
        <thead>
          <tr>
            <Th hideOnPhone>Date</Th>
            <Th>Expense</Th>
            <Th hideOnPhone>Category</Th>
            <Th hideOnPhone>Billable</Th>
            <Th numeric>Amount</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((e) => (
            <tr key={e.id}>
              <Td hideOnPhone className="tnum whitespace-nowrap text-ink-2">
                {longDate(e.date)}
              </Td>
              <Td>
                <TwoLine primary={e.vendor || e.category} secondary={`${longDate(e.date)} · ${e.category}${e.billable ? " · billable" : ""}`} phoneOnly />
              </Td>
              <Td hideOnPhone>
                <Tag>{e.category}</Tag>
              </Td>
              <Td hideOnPhone className="text-ink-2">
                {e.billable ? "Yes" : "No"}
              </Td>
              <Td numeric>
                <Money value={e.amount} />
              </Td>
              <Td className="text-right">
                <Button size="sm" variant="ghost" onClick={() => onEdit(e)} aria-label={`Edit expense ${e.vendor || e.category}`}>
                  Edit
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="total">
            <Td hideOnPhone colSpan={4}>
              Total · {expenses.length} {expenses.length === 1 ? "expense" : "expenses"}
            </Td>
            <Td className="md:hidden">Total</Td>
            <Td numeric>
              <Money value={finance.expenses} />
            </Td>
            <Td />
          </tr>
        </tfoot>
      </Table>
    </Section>
  );
}
