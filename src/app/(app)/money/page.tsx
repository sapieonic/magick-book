"use client";
import { useMemo, useState } from "react";
import { Receipt, Wallet, X } from "lucide-react";
import { Page, PageSplit } from "@/components/layout/Page";
import { PageHeader } from "@/components/layout/PageHeader";
import { MoneyEquation } from "@/components/money/MoneyEquation";
import { AgingBuckets } from "@/components/money/AgingBuckets";
import { CollectedByMonth } from "@/components/money/CollectedByMonth";
import { InvoiceTable, ledgerCsvRows } from "@/components/money/InvoiceTable";
import { ExpenseTable } from "@/components/money/ExpenseTable";
import { csvFilename, downloadCsv } from "@/components/money/csv";
import { Panel } from "@/components/ui/Panel";
import { Button, LinkButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState, RowsSkeleton, Skeleton } from "@/components/ui/Misc";
import { useApi } from "@/lib/client";
import { isoDay } from "@/lib/dates";
import { matchesInvoiceQuery, matchesLedgerFilter, type LedgerFilter } from "@/lib/money-charts";
import { AGING_LABELS } from "@/lib/receivables";
import type { AgingKey, MoneySummary } from "@/lib/types";

type View = "invoices" | "expenses";

const FILTER_LABEL: Record<Exclude<LedgerFilter, "all">, string> = {
  paid: "Paid",
  outstanding: "Outstanding",
  current: "Current, not yet due",
  d30: `${AGING_LABELS.d30} overdue`,
  d60: `${AGING_LABELS.d60} overdue`,
  d60plus: `${AGING_LABELS.d60plus} overdue`,
};

const isAging = (f: LedgerFilter): f is AgingKey => f in AGING_LABELS;

export default function MoneyPage() {
  const { data, loading, error, refresh } = useApi<MoneySummary>("/api/money");
  const [view, setView] = useState<View>("invoices");
  // One filter drives the ledger: a side of the equation or an aging band.
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [query, setQuery] = useState("");

  const now = useMemo(() => (data ? new Date(data.asOf) : new Date()), [data]);
  const invoices = useMemo(
    () => (data?.invoices ?? []).filter((inv) => matchesLedgerFilter(inv, filter, now) && matchesInvoiceQuery(inv, query)),
    [data?.invoices, filter, query, now],
  );

  const narrowInvoices = (f: LedgerFilter) => {
    setFilter(f);
    setView("invoices");
  };
  const resetFilters = () => {
    setFilter("all");
    setQuery("");
  };
  /** Exactly the rows the ledger shows under the current filter and search. */
  const exportCsv = () => downloadCsv(csvFilename("Invoices", isoDay(now)), ledgerCsvRows(invoices, now));

  return (
    <Page>
      <PageHeader title="Money" />
      {error ? (
        <Panel>
          <ErrorState message={error} onRetry={refresh} />
        </Panel>
      ) : loading || !data ? (
        <MoneySkeleton />
      ) : (
        <>
          {/* From xl the two columns stretch to one height, so neither leaves bare ground above the ledger. */}
          <PageSplit
            className="xl:items-stretch"
            railLabel="Collections"
            rail={<CollectedByMonth collected={data.collected} className="md:col-span-2 xl:col-span-1 xl:flex-1" />}
          >
            <MoneyEquation totals={data.totals} filter={filter} onFilter={narrowInvoices} onShowExpenses={() => setView("expenses")} />
            <AgingBuckets aging={data.aging} selected={isAging(filter) ? filter : null} onSelect={(k) => narrowInvoices(k ?? "all")} />
          </PageSplit>

          <Panel aria-label="Ledger">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2.5">
              <SegmentedControl
                aria-label="Show"
                value={view}
                onChange={setView}
                options={[
                  { value: "invoices", label: <>Invoices <span className="tnum text-ink-3">{data.invoices.length}</span></>, icon: Receipt },
                  { value: "expenses", label: <>Expenses <span className="tnum text-ink-3">{data.expenses.length}</span></>, icon: Wallet },
                ]}
              />
              {view === "invoices" && (
                <>
                  <Input
                    type="search"
                    aria-label="Filter invoices"
                    placeholder="Filter by account or number"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-[30px] w-[240px] text-[13px] max-md:w-full"
                  />
                  {filter !== "all" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint py-0.5 pl-3 pr-1 text-[13px] text-ink-1">
                      Showing {FILTER_LABEL[filter].toLowerCase()}
                      <button
                        type="button"
                        onClick={() => setFilter("all")}
                        aria-label="Clear filter, show all invoices"
                        className="inline-flex size-6 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink-1"
                      >
                        <X className="size-3.5" strokeWidth={1.5} aria-hidden />
                      </button>
                    </span>
                  )}
                  {invoices.length > 0 && (
                    <LinkButton className="ml-auto text-[13px]" onClick={exportCsv}>
                      Export CSV
                    </LinkButton>
                  )}
                </>
              )}
            </div>

            {view === "expenses" ? (
              data.expenses.length === 0 ? (
                <EmptyState icon={<Wallet className="size-6" strokeWidth={1.5} />} title="No expenses yet" description="Log costs from an account's Expenses tab." />
              ) : (
                <ExpenseTable expenses={data.expenses} />
              )
            ) : data.invoices.length === 0 ? (
              <EmptyState icon={<Receipt className="size-6" strokeWidth={1.5} />} title="No invoices yet" description="Bill an account from its Invoices tab." />
            ) : invoices.length === 0 ? (
              <EmptyState
                icon={<Receipt className="size-6" strokeWidth={1.5} />}
                title="No invoices match"
                description="Nothing in this view. Clear the filter to see every invoice."
                action={
                  <Button size="sm" onClick={resetFilters}>
                    Show all invoices
                  </Button>
                }
              />
            ) : (
              <InvoiceTable invoices={invoices} now={now} filtered={filter !== "all" || query.trim() !== ""} onChanged={refresh} />
            )}
          </Panel>
        </>
      )}
    </Page>
  );
}

function MoneySkeleton() {
  return (
    <>
      <p role="status" className="sr-only">
        Loading money…
      </p>
      <PageSplit
        rail={
          <Panel className="md:col-span-2 xl:col-span-1">
            <Skeleton className="h-[300px] w-full" />
          </Panel>
        }
      >
        <Panel>
          <div className="flex flex-wrap gap-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-12 w-36" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <Skeleton className="mb-4 h-4 w-40" />
          <Skeleton className="h-20 w-full" />
        </Panel>
      </PageSplit>
      <Panel>
        <RowsSkeleton rows={6} label="Loading invoices" />
      </Panel>
    </>
  );
}
