"use client";
import { useState, type ReactNode } from "react";
import { FileText, Mail, Plus, Receipt, Upload, Wallet } from "lucide-react";
import { Badge, Tag } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyState, RowsSkeleton } from "@/components/ui/Misc";
import { Money, formatMoney } from "@/components/ui/Money";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th, TwoLine } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { useInvoiceActions } from "@/components/invoices/useInvoiceActions";
import { marginFigures } from "@/components/money/margin";
import { DOCUMENT_KIND_META } from "@/lib/constants";
import { monthKey, shortDate } from "@/lib/dates";
import { isOutstanding } from "@/lib/receivables";
import type { AccountFinance, ContactDTO, DocumentDTO, ExpenseDTO, InvoiceDTO } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { documentMeta, openDocument } from "./AccountRail";
import { InvoiceNumber, InvoiceStatus } from "./StatementTable";

const icon = (Icon: typeof Mail) => <Icon className="size-6" strokeWidth={1.5} />;
/** Issued and Status columns of the Invoices tab show only from xl (1280); below that the status sits under the number. */
const WIDE_COL = "max-xl:hidden";
const plus = <Plus className="size-4" strokeWidth={1.5} aria-hidden />;

/**
 * A tab's panel: header with an add action, then a skeleton, empty state or
 * the table. Without `onAdd` (an archived account) there is no add action.
 */
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
  onAdd?: () => void;
  loading: boolean;
  empty: { icon: ReactNode; title: string; description: string } | null;
  children: ReactNode;
}) {
  const add = (variant: "primary" | "secondary") =>
    onAdd && (
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

/** Without `onAdd` / `onEdit` the list is read-only. */
export function ContactsSection({ contacts, loading, onAdd, onEdit }: { contacts: ContactDTO[]; loading: boolean; onAdd?: () => void; onEdit?: (c: ContactDTO) => void }) {
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
                {onEdit && (
                  <Button size="sm" variant="ghost" onClick={() => onEdit(c)} aria-label={`Edit ${c.name}`}>
                    Edit
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Section>
  );
}

/* -------------------------------------------------------------- documents */

/** `readOnly` keeps Open and drops Upload and Archive. */
export function DocumentsSection({
  accountId,
  documents,
  loading,
  readOnly,
  onUpload,
  onChanged,
}: {
  accountId: string;
  documents: DocumentDTO[];
  loading: boolean;
  readOnly?: boolean;
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
      onAdd={readOnly ? undefined : onUpload}
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
                {shortDate(d.createdAt)}
                {d.uploadedByName && <span className="text-ink-3"> · {d.uploadedByName}</span>}
              </Td>
              <Td className="whitespace-nowrap text-right">
                <span className="inline-flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openDocument(accountId, d.id)} aria-label={`Open ${d.title}`}>
                    Open
                  </Button>
                  {!readOnly && (
                    <Button size="sm" variant="ghost" loading={busyId === d.id} onClick={() => archive(d)} aria-label={`Archive ${d.title}`}>
                      Archive
                    </Button>
                  )}
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

/**
 * Every invoice with Remind and Mark paid on the outstanding ones, file upload
 * and Remove. `readOnly` keeps viewing the file and drops everything else.
 */
export function InvoicesSection({
  invoices,
  finance,
  loading,
  readOnly,
  onNew,
  onChanged,
}: {
  invoices: InvoiceDTO[];
  finance: AccountFinance;
  loading: boolean;
  readOnly?: boolean;
  onNew: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const actions = useInvoiceActions(onChanged);
  return (
    <Section
      title="Invoices"
      meta={`${formatMoney(finance.billed)} billed · ${formatMoney(finance.outstanding)} outstanding`}
      addLabel="New invoice"
      onAdd={readOnly ? undefined : onNew}
      loading={loading}
      empty={invoices.length ? null : { icon: icon(Receipt), title: "No invoices", description: "Bill this account to start tracking revenue." }}
    >
      <input {...actions.fileInputProps} />
      <Table>
        <thead>
          <tr>
            <Th>Invoice</Th>
            <Th className={WIDE_COL}>Issued</Th>
            <Th hideOnPhone>Due</Th>
            <Th numeric>Amount</Th>
            <Th className={WIDE_COL}>Status</Th>
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
                  <TwoLine
                    primary={<InvoiceNumber n={inv.number} />}
                    secondary={
                      <span className="block xl:hidden">
                        <InvoiceStatus invoice={inv} />
                      </span>
                    }
                  />
                </Td>
                <Td className={cn(WIDE_COL, "tnum whitespace-nowrap text-ink-2")}>{shortDate(inv.issuedAt)}</Td>
                <Td hideOnPhone className="tnum whitespace-nowrap text-ink-2">
                  {inv.dueAt ? shortDate(inv.dueAt) : "–"}
                </Td>
                <Td numeric>
                  <Money value={inv.amount} />
                </Td>
                <Td className={WIDE_COL}>
                  <InvoiceStatus invoice={inv} />
                </Td>
                <Td hideOnPhone className="whitespace-nowrap">
                  {inv.hasFile ? (
                    <span className="inline-flex gap-3 text-[13px]">
                      <LinkButton onClick={() => actions.openFile(inv)} aria-label={`View invoice #${inv.number} file`}>
                        View
                      </LinkButton>
                      {!readOnly && (
                        <button type="button" className="text-ink-3 hover:text-ink-1 disabled:opacity-50" disabled={busy} onClick={() => actions.attachFile(inv)} aria-label={`Replace invoice #${inv.number} file`}>
                        Replace
                        </button>
                      )}
                    </span>
                  ) : readOnly ? (
                    <span className="text-ink-3">–</span>
                  ) : (
                    <LinkButton className="inline-flex items-center gap-1.5 text-[13px] disabled:opacity-50" disabled={busy} onClick={() => actions.attachFile(inv)} aria-label={`Upload invoice #${inv.number} file`}>
                      <Upload className="size-3.5" strokeWidth={1.5} aria-hidden /> Upload
                    </LinkButton>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-right">
                  {!readOnly && (
                    <span className="inline-flex items-center gap-1 max-md:flex-col max-md:items-end max-md:py-1.5">
                      {isOutstanding(inv) && (
                        <>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => actions.remind(inv)} aria-label={`Remind, invoice #${inv.number}`}>
                            Remind
                          </Button>
                          <Button size="sm" loading={busy} onClick={() => actions.markPaid(inv)} aria-label={`Mark invoice #${inv.number} paid`}>
                            Mark paid
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => actions.remove(inv)} aria-label={`Remove invoice #${inv.number}`}>
                        Remove
                      </Button>
                    </span>
                  )}
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

/** Without `onNew` / `onEdit` the list is read-only. */
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
  onNew?: () => void;
  onEdit?: (e: ExpenseDTO) => void;
}) {
  const month = monthKey(new Date());
  const thisMonth = expenses.filter((e) => monthKey(e.date) === month).reduce((s, e) => s + e.amount, 0);
  const margin = marginFigures(finance);

  return (
    <Section
      title="Expenses"
      meta={`${formatMoney(thisMonth)} this month${margin.pct ? ` · ${margin.pct} margin` : ""}`}
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
                {shortDate(e.date)}
              </Td>
              <Td>
                <TwoLine primary={e.vendor || e.category} secondary={`${shortDate(e.date)} · ${e.category}${e.billable ? " · billable" : ""}`} phoneOnly />
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
                {onEdit && (
                  <Button size="sm" variant="ghost" onClick={() => onEdit(e)} aria-label={`Edit expense ${e.vendor || e.category}`}>
                    Edit
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="total">
            <Td hideOnPhone colSpan={4}>
              Total · {plural(expenses.length, "expense")}
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
