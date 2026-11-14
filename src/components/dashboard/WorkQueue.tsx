"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Money } from "@/components/ui/Money";
import { OwnerCell } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { Table, Th, Td, TwoLine } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { STAGE_META } from "@/lib/constants";
import { Staleness } from "@/components/ui/Staleness";
import { businessDay, calendarDaysBetween, dueWords } from "@/lib/dates";
import { cn, plural } from "@/lib/utils";
import { useInvoiceActions } from "@/components/invoices/useInvoiceActions";
import { NoteComposer } from "@/components/activity/NoteComposer";
import { Modal } from "@/components/ui/Overlay";
import type { WorkItem } from "@/lib/types";

/** Rows the phone list shows before "Show N more". */
const PHONE_LIMIT = 4;

/**
 * Follow-ups, due reminders and overdue invoices, oldest first, each with its
 * next step. Every action goes through `api`, whose change event reloads Today.
 */
export function WorkQueue({ items, now }: { items: WorkItem[]; now: Date }) {
  const [logging, setLogging] = useState<{ id: string; label: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const invoices = useInvoiceActions();
  const actions = (item: WorkItem, phone?: boolean) => <RowActions item={item} now={now} phone={phone} invoices={invoices} onLog={setLogging} />;
  const phoneItems = showAll ? items : items.slice(0, PHONE_LIMIT);
  const hidden = items.length - phoneItems.length;

  return (
    <Panel title="Work queue" meta={items.length || undefined} actions={items.length > 1 && <span className="text-ink-3">Oldest first</span>} ruled>
      {items.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={<CheckCircle2 className="size-6" strokeWidth={1.5} aria-hidden />}
          title="Nothing is waiting on you"
          description="Follow-ups, reminders due today and overdue invoices land here."
        />
      ) : (
        <>
          <Table className="max-md:hidden">
            <thead>
              <tr>
                <Th>Next action</Th>
                <Th numeric>Value</Th>
                <Th>Last touched</Th>
                <Th>Owner</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <Td>
                    <TwoLine primary={<ItemTitle item={item} />} secondary={<ItemContext item={item} now={now} />} />
                  </Td>
                  <Td numeric>
                    <Money value={item.value} />
                  </Td>
                  <Td>
                    <LastTouched item={item} now={now} />
                  </Td>
                  <Td>
                    <OwnerCell name={item.ownerName} first size={24} />
                  </Td>
                  <Td className="text-right">{actions(item)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <ul className="md:hidden">
            {phoneItems.map((item) => (
              <li key={item.id} className="border-b border-line py-3 last:border-b-0">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5">
                  <span className="font-medium">
                    <ItemTitle item={item} />
                  </span>
                  <Money value={item.value} className="text-right font-medium" />
                  <span className="text-[13px] text-ink-3">
                    <ItemContext item={item} now={now} />
                  </span>
                  <span className="text-right text-[13px]">
                    <LastTouched item={item} now={now} />
                  </span>
                </div>
                <div className="mt-2.5 flex gap-2">{actions(item, true)}</div>
              </li>
            ))}
          </ul>
          {items.length > PHONE_LIMIT && (
            <Button variant="ghost" className="mt-1 w-full md:hidden" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show ${hidden} more`}
            </Button>
          )}
        </>
      )}
      <LogActivityModal lead={logging} onClose={() => setLogging(null)} />
    </Panel>
  );
}

/** Log a reach-out on a lead's timeline straight from the queue, with the lead page's composer. */
function LogActivityModal({ lead, onClose }: { lead: { id: string; label: string } | null; onClose: () => void }) {
  const { toast } = useToast();
  return (
    <Modal open={!!lead} onClose={onClose} title="Log activity" subtitle={lead?.label} size="sm">
      {lead && (
        <NoteComposer
          autoFocus
          postUrl={`/api/leads/${lead.id}/activities`}
          kinds={["call", "whatsapp", "email", "sms", "meeting"]}
          onAdded={() => {
            toast(`Logged for ${lead.label}.`, "success");
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

function ItemTitle({ item }: { item: WorkItem }) {
  return item.href ? (
    <Link href={item.href} className="text-ink-1 hover:underline">
      {item.title}
    </Link>
  ) : (
    <>{item.title}</>
  );
}

function ItemContext({ item, now }: { item: WorkItem; now: Date }) {
  const parts: ReactNode[] = [];
  if (item.kind === "invoice") {
    parts.push(<span className="font-mono text-[13px]">Invoice #{item.invoiceNumber}</span>);
    const late = item.dueAt ? calendarDaysBetween(now, item.dueAt) : 0;
    if (late > 0) parts.push(<span className="text-overdue">{plural(late, "day")} overdue</span>);
  } else {
    if (item.kind === "reminder" && item.name) parts.push(item.name);
    if (item.company) parts.push(item.company);
    if (item.stage) parts.push(STAGE_META[item.stage].label);
    if (item.kind === "reminder" && item.dueAt) parts.push(<span className="text-due">Reminder {dueWords(item.dueAt, now)}</span>);
  }
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {p}
        </span>
      ))}
    </>
  );
}

function LastTouched({ item, now }: { item: WorkItem; now: Date }) {
  if (!item.lastTouchedAt) return <span className="text-ink-3">–</span>;
  return <Staleness since={item.lastTouchedAt} now={now} className="whitespace-nowrap text-ink-2" />;
}

interface Action {
  key: string;
  label: string;
  /** Accessible name when the visible label alone is ambiguous. */
  aria: string;
  /** Resolves to a toast message, or nothing when the action toasts for itself. */
  run: () => Promise<string | void>;
}

/** Inline next steps, backed by the leads and reminders APIs and the shared invoice actions. */
function RowActions({
  item,
  now,
  phone,
  invoices,
  onLog,
}: {
  item: WorkItem;
  now: Date;
  phone?: boolean;
  invoices: ReturnType<typeof useInvoiceActions>;
  onLog: (lead: { id: string; label: string }) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const snoozeTo = businessDay(now, 1, 9).toISOString();

  const list: Action[] = [];
  if (item.kind === "followup" && item.leadId) {
    const lead = { id: item.leadId, label: [item.name, item.company].filter(Boolean).join(" · ") };
    list.push(
      { key: "log", label: "Log call", aria: `Log call for ${lead.label}`, run: async () => onLog(lead) },
      {
        key: "snooze",
        label: "Snooze",
        aria: `Snooze ${lead.label} until tomorrow`,
        run: async () => {
          await api.post("/api/reminders", { title: item.title, dueAt: snoozeTo, leadId: item.leadId });
          return "Snoozed until tomorrow morning.";
        },
      },
    );
  } else if (item.kind === "reminder" && item.reminderId) {
    list.push(
      {
        key: "done",
        label: "Done",
        aria: `Done with reminder: ${item.title}`,
        run: async () => {
          await api.patch(`/api/reminders/${item.reminderId}`, { action: "complete" });
          return "Reminder done.";
        },
      },
      {
        key: "snooze",
        label: "Snooze",
        aria: `Snooze reminder until tomorrow: ${item.title}`,
        run: async () => {
          await api.patch(`/api/reminders/${item.reminderId}`, { action: "snooze", dueAt: snoozeTo });
          return "Snoozed until tomorrow morning.";
        },
      },
    );
  } else if (item.kind === "invoice" && item.invoiceId && item.invoiceNumber != null) {
    // The shared hook confirms and toasts on its own.
    const invoice = { id: item.invoiceId, number: item.invoiceNumber, amount: item.value };
    list.push(
      { key: "remind", label: "Send reminder", aria: `Send reminder for invoice #${invoice.number}`, run: () => invoices.remind(invoice) },
      { key: "paid", label: "Mark paid", aria: `Mark paid: invoice #${invoice.number}`, run: () => invoices.markPaid(invoice) },
    );
  }

  async function run(action: Action) {
    setBusy(action.key);
    try {
      const message = await action.run();
      if (message) toast(message, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className={cn("inline-flex gap-1", phone && "flex w-full gap-2")}>
      {list.map((a, i) => (
        <Button
          key={a.key}
          size={phone ? "lg" : "sm"}
          variant={phone ? (i === 0 ? "primary" : "secondary") : i === 0 ? "secondary" : "ghost"}
          className={cn(phone && "flex-1")}
          aria-label={a.aria}
          loading={busy === a.key}
          disabled={busy !== null && busy !== a.key}
          onClick={() => run(a)}
        >
          {a.label}
        </Button>
      ))}
    </span>
  );
}
