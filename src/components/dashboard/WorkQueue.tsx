"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Money } from "@/components/ui/Money";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { Table, Th, Td, TwoLine } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/client";
import { STAGE_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ageWords, daysSince, dueWords, plural, tomorrowMorning } from "./format";
import { LogActivityModal } from "./LogActivityModal";
import type { WorkItem } from "@/lib/types";

/** Follow-ups, due reminders and overdue invoices, oldest first, each with its next step. */
export function WorkQueue({ items, now, onChanged }: { items: WorkItem[]; now: Date; onChanged: () => void }) {
  const [logging, setLogging] = useState<{ id: string; label: string } | null>(null);
  const actions = (item: WorkItem, phone?: boolean) => (
    <RowActions item={item} now={now} phone={phone} onChanged={onChanged} onLog={setLogging} />
  );

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
                    <Owner name={item.ownerName} />
                  </Td>
                  <Td className="text-right">{actions(item)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <ul className="md:hidden">
            {items.map((item) => (
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
        </>
      )}
      <LogActivityModal lead={logging} onClose={() => setLogging(null)} onLogged={onChanged} />
    </Panel>
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
    const late = item.dueAt ? daysSince(item.dueAt, now) : 0;
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
  const stale = daysSince(item.lastTouchedAt, now) > 30;
  return (
    <time dateTime={item.lastTouchedAt} className={cn("whitespace-nowrap", stale ? "text-overdue" : "text-ink-2")}>
      {ageWords(item.lastTouchedAt, now)}
    </time>
  );
}

function Owner({ name }: { name: string }) {
  if (!name) return <span className="text-ink-3">–</span>;
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-ink-2">
      <Avatar name={name} size={24} />
      {name.split(" ")[0]}
    </span>
  );
}

interface Action {
  key: string;
  label: string;
  /** Accessible name when the visible label alone is ambiguous. */
  aria: string;
  run: () => Promise<string | null | void>;
}

/** Inline next steps, backed by the leads, reminders and invoices APIs. */
function RowActions({
  item,
  now,
  phone,
  onChanged,
  onLog,
}: {
  item: WorkItem;
  now: Date;
  phone?: boolean;
  onChanged: () => void;
  onLog: (lead: { id: string; label: string }) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const snoozeTo = tomorrowMorning(now).toISOString();

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
  } else if (item.kind === "invoice" && item.invoiceId) {
    const invoice = `invoice #${item.invoiceNumber}`;
    list.push(
      {
        key: "remind",
        label: "Send reminder",
        aria: `Send reminder for ${invoice}`,
        run: async () => {
          await api.patch(`/api/invoices/${item.invoiceId}`, { action: "remind" });
          return `Payment reminder sent to ${item.name}.`;
        },
      },
      {
        key: "paid",
        label: "Mark paid",
        aria: `Mark paid: ${invoice}`,
        run: async () => {
          const yes = await confirm({ title: `Mark ${invoice} as paid?`, description: `Records the payment from ${item.name} today.`, confirmLabel: "Mark paid" });
          if (!yes) return null;
          await api.patch(`/api/invoices/${item.invoiceId}`, { status: "paid" });
          return `Invoice #${item.invoiceNumber} marked paid.`;
        },
      },
    );
  }

  async function run(action: Action) {
    setBusy(action.key);
    try {
      const message = await action.run();
      if (message) {
        toast(message, "success");
        onChanged();
      }
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
