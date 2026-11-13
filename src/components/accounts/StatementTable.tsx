"use client";
import { useMemo } from "react";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { Money } from "@/components/ui/Money";
import { Panel } from "@/components/ui/Panel";
import { StatusPill } from "@/components/ui/Badge";
import { Table, Td, Th, TwoLine } from "@/components/ui/Table";
import type { ExpenseDTO, InvoiceDTO } from "@/lib/types";
import { RowsSkeleton } from "./parts";
import { buildStatement, longDate, overdueLabel, type StatementEntry } from "./statement";
import { useInvoiceActions } from "./useInvoiceActions";

export function InvoiceStatus({ invoice }: { invoice: InvoiceDTO }) {
  return invoice.status === "overdue" ? <StatusPill tone="overdue">{overdueLabel(invoice)}</StatusPill> : <StatusPill status={invoice.status} />;
}

export const InvoiceNumber = ({ n }: { n: number }) => <span className="font-mono text-[13px]">#{n}</span>;

function describe(e: StatementEntry) {
  if (e.kind === "invoice") return <>Invoice <InvoiceNumber n={e.invoice.number} /></>;
  if (e.kind === "payment") return <>Payment for <InvoiceNumber n={e.invoice.number} /></>;
  return <>{e.expense.vendor ? `${e.expense.category} · ${e.expense.vendor}` : `${e.expense.category} expense`}</>;
}

/**
 * Overview main: every invoice, payment and expense in date order (newest
 * first) with the outstanding balance after each, and inline Mark paid /
 * Download on invoice rows.
 */
export function StatementTable({
  invoices,
  expenses,
  loading,
  onChanged,
  onNewInvoice,
}: {
  invoices: InvoiceDTO[];
  expenses: ExpenseDTO[];
  loading: boolean;
  onChanged: () => void | Promise<void>;
  onNewInvoice?: () => void;
}) {
  const { entries, totals } = useMemo(() => buildStatement(invoices, expenses), [invoices, expenses]);
  const actions = useInvoiceActions(onChanged);

  return (
    <Panel title="Statement" meta="every invoice, payment and cost, with the balance after each">
      {loading ? (
        <RowsSkeleton />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-6" strokeWidth={1.5} />}
          title="Nothing on the statement yet"
          description="Invoices, payments and costs for this account appear here as they happen."
          action={
            onNewInvoice && (
              <Button variant="primary" onClick={onNewInvoice}>
                New invoice
              </Button>
            )
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th hideOnPhone>Date</Th>
              <Th>Entry</Th>
              <Th numeric hideOnPhone>Billed</Th>
              <Th numeric hideOnPhone>Received</Th>
              <Th numeric hideOnPhone>Cost</Th>
              <Th numeric>Balance</Th>
              <Th hideOnPhone>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const inv = e.kind === "invoice" ? e.invoice : null;
              const moved = e.kind === "payment" || (e.kind === "invoice" && e.counted);
              return (
                <tr key={e.key} className={e.kind === "invoice" ? undefined : "text-ink-2"}>
                  <Td hideOnPhone className="tnum whitespace-nowrap text-ink-2">
                    {longDate(e.date)}
                  </Td>
                  <Td>
                    <TwoLine className="py-1.5" primary={describe(e)} secondary={<span className="tnum">{longDate(e.date)}</span>} phoneOnly />
                  </Td>
                  <Td numeric hideOnPhone>
                    {inv && <Money value={inv.amount} className={e.kind === "invoice" && !e.counted ? "text-ink-3" : undefined} />}
                  </Td>
                  <Td numeric hideOnPhone>
                    {e.kind === "payment" ? <Money value={e.invoice.amount} className="text-paid" /> : <Money value={0} />}
                  </Td>
                  <Td numeric hideOnPhone>
                    <Money value={e.kind === "expense" ? e.expense.amount : 0} />
                  </Td>
                  <Td numeric>
                    <Money value={e.balance} className={moved ? "font-semibold text-ink-1" : "text-ink-3"} />
                  </Td>
                  <Td hideOnPhone>{inv && <InvoiceStatus invoice={inv} />}</Td>
                  <Td className="text-right">
                    {inv && (
                      <span className="inline-flex items-center gap-3">
                        {inv.hasFile && (
                          <button type="button" className="link text-[13px]" onClick={() => actions.openFile(inv)} aria-label={`Download invoice #${inv.number}`}>
                            Download
                          </button>
                        )}
                        {(inv.status === "sent" || inv.status === "overdue") && (
                          <Button size="sm" loading={actions.busyId === inv.id} onClick={() => actions.markPaid(inv)} aria-label={`Mark invoice #${inv.number} paid`}>
                            Mark paid
                          </Button>
                        )}
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="total">
              <Td hideOnPhone colSpan={2}>
                Total · {totals.invoices} {totals.invoices === 1 ? "invoice" : "invoices"}, {totals.payments} {totals.payments === 1 ? "payment" : "payments"}
              </Td>
              <Td className="md:hidden">Outstanding</Td>
              <Td numeric hideOnPhone>
                <Money value={totals.billed} />
              </Td>
              <Td numeric hideOnPhone>
                <Money value={totals.received} />
              </Td>
              <Td numeric hideOnPhone>
                <Money value={totals.cost} />
              </Td>
              <Td numeric>
                <Money value={totals.balance} />
              </Td>
              <Td hideOnPhone />
              <Td />
            </tr>
          </tfoot>
        </Table>
      )}
    </Panel>
  );
}
