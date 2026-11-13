"use client";
import { use, useState } from "react";
import { Archive } from "lucide-react";
import { Page, PageSplit } from "@/components/layout/Page";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { AuditTimeline } from "@/components/AuditTimeline";
import { NoteComposer } from "@/components/activity/NoteComposer";
import { ReminderModal } from "@/components/reminders/ReminderModal";
import { AccountHeader, StatementBar } from "@/components/accounts/AccountHeader";
import { ContactModal, ExpenseModal, NewInvoiceModal, UploadDocumentModal } from "@/components/accounts/AccountModals";
import { DocumentsRailPanel, PrimaryContactPanel, RecentActivityPanel, RemindersPanel } from "@/components/accounts/AccountRail";
import { ContactsSection, DocumentsSection, ExpensesSection, InvoicesSection } from "@/components/accounts/AccountSections";
import { StatementTable } from "@/components/accounts/StatementTable";
import { longDate } from "@/components/accounts/statement";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyState, ErrorState, RowsSkeleton, Skeleton } from "@/components/ui/Misc";
import { Panel } from "@/components/ui/Panel";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import type { AccountDTO, AccountFinance, ActivityDTO, AuditLogDTO, ContactDTO, DocumentDTO, ExpenseDTO, InvoiceDTO, ReminderDTO } from "@/lib/types";

type Tab = "overview" | "contacts" | "documents" | "invoices" | "expenses" | "activity" | "history";

/** Which modal is open; contact and expense carry the record being edited, if any. */
type Dialog =
  | { kind: "contact"; contact?: ContactDTO }
  | { kind: "expense"; expense?: ExpenseDTO }
  | { kind: "invoice" }
  | { kind: "document" }
  | null;

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reminder, setReminder] = useState<{ title: string } | null>(null);

  const base = `/api/accounts/${id}`;
  const acc = useApi<{ account: AccountDTO; finance: AccountFinance }>(base);
  const contacts = useApi<{ contacts: ContactDTO[] }>(`${base}/contacts`);
  const documents = useApi<{ documents: DocumentDTO[] }>(`${base}/documents`);
  const invoices = useApi<{ invoices: InvoiceDTO[] }>(`${base}/invoices`);
  const expenses = useApi<{ expenses: ExpenseDTO[] }>(`${base}/expenses`);
  const activity = useApi<{ activities: ActivityDTO[] }>(`${base}/activity`);
  const history = useApi<{ entries: AuditLogDTO[] }>(`${base}/audit`);
  const reminders = useApi<{ reminders: ReminderDTO[] }>("/api/reminders?status=scheduled");

  const reload = (...sources: { refresh: () => Promise<void> }[]) => Promise.all(sources.map((s) => s.refresh())).then(() => undefined);
  const onContactsChanged = () => reload(contacts, acc, history);
  const onDocumentsChanged = () => reload(documents, history);
  const onMoneyChanged = () => reload(acc, invoices, expenses, activity, history);

  if (acc.error && !acc.data) {
    return (
      <Page>
        <PageHeader title="Account" breadcrumb={[{ label: "Accounts", href: "/accounts" }]} />
        <Panel>
          <ErrorState message={acc.error} onRetry={acc.refresh} />
        </Panel>
      </Page>
    );
  }
  if (!acc.data) return <LoadingAccount />;

  const { account, finance } = acc.data;
  const archived = Boolean(account.deletedAt);
  const contactList = contacts.data?.contacts ?? [];
  const documentList = documents.data?.documents ?? [];
  const invoiceList = invoices.data?.invoices ?? [];
  const expenseList = expenses.data?.expenses ?? [];
  const activityList = activity.data?.activities ?? [];
  const accountReminders = (reminders.data?.reminders ?? []).filter((r) => r.accountId === id);
  const primary = contactList.find((c) => c.isPrimary) ?? account.primaryContact;

  async function setArchived(next: boolean) {
    if (next) {
      const ok = await confirm({
        title: `Archive ${account.name}?`,
        description: "It leaves your lists. Contacts, invoices, expenses and documents stay with it and come back if you restore it.",
        confirmLabel: "Archive account",
        tone: "danger",
      });
      if (!ok) return;
    }
    try {
      if (next) await api.delete(base);
      else await api.patch(base, { action: "restore" });
      toast(next ? `${account.name} archived.` : `${account.name} restored.`, next ? "info" : "success");
      await (next ? acc.refresh() : reload(acc, contacts, documents, invoices, expenses, activity, history));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong", "error");
    }
  }

  const open = (d: Dialog) => () => setDialog(d);
  const remind = (title = "") => setReminder({ title });

  return (
    <Page>
      <PageHeader title={account.name} breadcrumb={[{ label: "Accounts", href: "/accounts" }]} />

      <AccountHeader
        account={account}
        actions={
          archived ? (
            <Button variant="primary" onClick={() => setArchived(false)}>
              Restore account
            </Button>
          ) : (
            <>
              <Button onClick={() => remind()}>Remind</Button>
              <Button onClick={open({ kind: "contact" })}>Add contact</Button>
              <Button variant="primary" onClick={open({ kind: "invoice" })}>
                New invoice
              </Button>
            </>
          )
        }
        menu={
          archived
            ? []
            : [
                { label: "Log expense", onSelect: open({ kind: "expense" }) },
                { label: "Upload document", onSelect: open({ kind: "document" }) },
                { label: "Archive account", onSelect: () => setArchived(true), danger: true },
              ]
        }
      />

      <StatementBar finance={finance} invoices={invoiceList} expenses={expenseList} onAddExpense={archived ? undefined : open({ kind: "expense" })} />

      {archived ? (
        <Panel>
          <EmptyState
            icon={<Archive className="size-6" strokeWidth={1.5} />}
            title={`Archived on ${longDate(account.deletedAt!)}`}
            description="Restore the account to see and work with its contacts, invoices, expenses, documents and activity again."
            action={
              <Button variant="primary" onClick={() => setArchived(false)}>
                Restore account
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <div className="glass rounded-panel px-4 pt-3.5 md:px-6">
            <Tabs<Tab>
              aria-label="Account sections"
              value={tab}
              onChange={setTab}
              className="border-b-0"
              tabs={[
                { key: "overview", label: "Overview" },
                { key: "contacts", label: "Contacts", count: contacts.data ? contactList.length : undefined },
                { key: "documents", label: "Documents", count: documents.data ? documentList.length : undefined },
                { key: "invoices", label: "Invoices", count: invoices.data ? invoiceList.length : undefined },
                { key: "expenses", label: "Expenses", count: expenses.data ? expenseList.length : undefined },
                { key: "activity", label: "Activity" },
                { key: "history", label: "History" },
              ]}
            />
          </div>

          {tab === "overview" && (
            <PageSplit
              railLabel="Account context"
              rail={
                <>
                  <PrimaryContactPanel contact={primary} onAll={() => setTab("contacts")} onAdd={open({ kind: "contact" })} />
                  <DocumentsRailPanel accountId={id} documents={documentList} onUpload={open({ kind: "document" })} />
                  <RemindersPanel reminders={accountReminders} onAdd={() => remind()} />
                  <RecentActivityPanel activities={activityList} onAll={() => setTab("activity")} />
                </>
              }
            >
              <StatementTable
                invoices={invoiceList}
                expenses={expenseList}
                loading={invoices.loading || expenses.loading}
                onChanged={onMoneyChanged}
                onNewInvoice={open({ kind: "invoice" })}
              />
            </PageSplit>
          )}
          {tab === "contacts" && (
            <ContactsSection contacts={contactList} loading={contacts.loading} onAdd={open({ kind: "contact" })} onEdit={(contact) => setDialog({ kind: "contact", contact })} />
          )}
          {tab === "documents" && (
            <DocumentsSection accountId={id} documents={documentList} loading={documents.loading} onUpload={open({ kind: "document" })} onChanged={onDocumentsChanged} />
          )}
          {tab === "invoices" && (
            <InvoicesSection invoices={invoiceList} finance={finance} loading={invoices.loading} onNew={open({ kind: "invoice" })} onChanged={onMoneyChanged} />
          )}
          {tab === "expenses" && (
            <ExpensesSection
              expenses={expenseList}
              finance={finance}
              loading={expenses.loading}
              onNew={open({ kind: "expense" })}
              onEdit={(expense) => setDialog({ kind: "expense", expense })}
            />
          )}
          {tab === "activity" && (
            <Panel title="Activity">
              <NoteComposer postUrl={`${base}/activity`} onAdded={() => reload(activity, acc)} onRemind={remind} />
              {activity.data ? <ActivityTimeline activities={activityList} /> : <RowsSkeleton />}
            </Panel>
          )}
          {tab === "history" && (
            <Panel title="History" meta="every change to this account and its records">
              {history.data ? <AuditTimeline entries={history.data.entries} showEntity /> : <RowsSkeleton />}
            </Panel>
          )}
        </>
      )}

      {dialog?.kind === "contact" && <ContactModal accountId={id} contact={dialog.contact} onClose={() => setDialog(null)} onChanged={onContactsChanged} />}
      {dialog?.kind === "expense" && <ExpenseModal accountId={id} expense={dialog.expense} onClose={() => setDialog(null)} onChanged={onMoneyChanged} />}
      {dialog?.kind === "invoice" && <NewInvoiceModal accountId={id} onClose={() => setDialog(null)} onCreated={onMoneyChanged} />}
      {dialog?.kind === "document" && <UploadDocumentModal accountId={id} onClose={() => setDialog(null)} onUploaded={onDocumentsChanged} />}
      <ReminderModal
        open={reminder !== null}
        accountId={id}
        entityName={account.name}
        initialTitle={reminder?.title ?? ""}
        onClose={() => setReminder(null)}
        onCreated={() => reload(reminders, activity, acc)}
      />
    </Page>
  );
}

function LoadingAccount() {
  return (
    <Page>
      <PageHeader title="Account" breadcrumb={[{ label: "Accounts", href: "/accounts" }]} />
      <Panel aria-label="Loading account">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </Panel>
      <Panel>
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-3 h-3 w-full" />
      </Panel>
      <Panel>
        <RowsSkeleton label="Loading account" />
      </Panel>
    </Page>
  );
}
