"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Receipt, Wallet, X } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { Badge } from "@/components/ui/Badge";
import { Card, PageLoader, ErrorState, EmptyState } from "@/components/ui/Misc";
import { useApi } from "@/lib/client";
import { INVOICE_STATUS_META } from "@/lib/constants";
import { formatINR, formatINRCompact, cn } from "@/lib/utils";
import { format } from "date-fns";
import type { InvoiceDTO, ExpenseDTO } from "@/lib/types";

interface MoneyData {
  invoices: InvoiceDTO[];
  expenses: ExpenseDTO[];
  totals: { billed: number; paid: number; outstanding: number; expenses: number; margin: number };
}

/** The single source of truth driving both the active tab and the row filter. */
type KpiFilter = "billed" | "paid" | "outstanding" | "expenses";

const FILTER_TAB: Record<KpiFilter, "invoices" | "expenses"> = {
  billed: "invoices",
  paid: "invoices",
  outstanding: "invoices",
  expenses: "expenses",
};

const FILTER_LABEL: Record<KpiFilter, string> = {
  billed: "Billed",
  paid: "Paid",
  outstanding: "Outstanding",
  expenses: "Expenses",
};

export default function MoneyPage() {
  const { data, loading, error, refresh } = useApi<MoneyData>("/api/money");
  // Single piece of state: the active KPI drives both the tab and the row filter.
  const [filter, setFilter] = useState<KpiFilter>("billed");

  const tab = FILTER_TAB[filter];

  const invoices = useMemo(() => {
    const all = data?.invoices ?? [];
    if (filter === "paid") return all.filter((i) => i.status === "paid");
    if (filter === "outstanding") return all.filter((i) => i.status === "sent" || i.status === "overdue");
    // "billed" mirrors the KPI: every issued (non-draft) invoice.
    if (filter === "billed") return all.filter((i) => i.status !== "draft");
    return all;
  }, [data?.invoices, filter]);

  const expenses = data?.expenses ?? [];

  // Switching tabs clears any sub-filter back to that tab's headline KPI.
  const selectTab = (t: "invoices" | "expenses") =>
    setFilter(t === "invoices" ? "billed" : "expenses");

  return (
    <>
      <PageHeader>
        <h1 className="font-display text-[22px] font-bold tracking-tight text-ink">Money</h1>
        <p className="ml-1 hidden text-[13px] text-muted sm:block">· invoices & expenses across every account</p>
      </PageHeader>

      <div className="px-6 py-6 lg:px-8">
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading ? (
          <PageLoader label="Tallying the books…" />
        ) : !data ? null : (
          <div className="mx-auto max-w-[1100px] space-y-5">
            {/* Totals — clickable KPIs drill into the table below */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Stat label="Billed" value={data.totals.billed} active={filter === "billed"} onSelect={() => setFilter("billed")} />
              <Stat label="Paid" value={data.totals.paid} tone="success" active={filter === "paid"} onSelect={() => setFilter("paid")} />
              <Stat label="Outstanding" value={data.totals.outstanding} tone="danger" active={filter === "outstanding"} onSelect={() => setFilter("outstanding")} />
              <Stat label="Expenses" value={data.totals.expenses} active={filter === "expenses"} onSelect={() => setFilter("expenses")} />
              <Stat label="Margin" pct={Math.round(data.totals.margin * 100)} tone="violet" />
            </div>

            {/* Tabs + active-filter affordance */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-line bg-paper p-1 w-fit">
                {(["invoices", "expenses"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => selectTab(t)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 text-[12.5px] font-semibold capitalize transition-all",
                      tab === t ? "bg-violet-50 text-violet-700" : "text-muted hover:text-ink",
                    )}
                  >
                    {t === "invoices" ? <Receipt className="size-4" /> : <Wallet className="size-4" />} {t}
                  </button>
                ))}
              </div>

              {/* Reflect a narrowing sub-filter (paid / outstanding) with a clearable chip */}
              {(filter === "paid" || filter === "outstanding") && (
                <div className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-violet-200 bg-violet-50 px-2.5 py-1 text-[12px] font-medium text-violet-700">
                  Filtered by: {FILTER_LABEL[filter]}
                  <button
                    onClick={() => setFilter("billed")}
                    aria-label="Clear filter"
                    className="-mr-0.5 inline-flex size-4 items-center justify-center rounded-full text-violet-500 transition-colors hover:bg-violet-100 hover:text-violet-700"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              )}
            </div>

            {tab === "invoices" ? (
              invoices.length === 0 ? (
                <EmptyState
                  icon={<Receipt className="size-6" />}
                  title={
                    filter === "paid"
                      ? "No paid invoices"
                      : filter === "outstanding"
                        ? "No outstanding invoices"
                        : "No invoices yet"
                  }
                  description={
                    filter === "paid"
                      ? "Once invoices are marked paid they'll show up here."
                      : filter === "outstanding"
                        ? "Nothing awaiting payment — every issued invoice is settled."
                        : "Bill an account from its Invoices tab."
                  }
                />
              ) : (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px]">
                    <thead>
                      <tr className="border-b border-line bg-canvas/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                        <th className="px-5 py-3">Invoice</th>
                        <th className="px-5 py-3">Account</th>
                        <th className="px-5 py-3">Issued</th>
                        <th className="px-5 py-3 text-right">Amount</th>
                        <th className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="text-[13px]">
                          <td className="px-5 py-3.5 font-mono font-semibold text-ink">#{inv.number}</td>
                          <td className="px-5 py-3.5"><Link href={`/accounts/${inv.accountId}`} className="font-medium text-ink-soft hover:text-violet-700">{inv.accountName}</Link></td>
                          <td className="px-5 py-3.5 text-muted">{format(new Date(inv.issuedAt), "MMM dd, yyyy")}</td>
                          <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink tnum">{formatINR(inv.amount)}</td>
                          <td className="px-5 py-3.5"><Badge tint={INVOICE_STATUS_META[inv.status].tint}>{INVOICE_STATUS_META[inv.status].label}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </Card>
              )
            ) : expenses.length === 0 ? (
              <EmptyState icon={<Wallet className="size-6" />} title="No expenses yet" description="Log costs from an account's Expenses tab." />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Account</th>
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
                        <td className="px-5 py-3.5"><Link href={`/accounts/${e.accountId}`} className="font-medium text-ink-soft hover:text-violet-700">{e.accountName}</Link></td>
                        <td className="px-5 py-3.5"><Badge tone="neutral">{e.category}</Badge></td>
                        <td className="px-5 py-3.5 text-ink-soft">{e.vendor || "—"}</td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink tnum">{formatINR(e.amount)}</td>
                        <td className="px-5 py-3.5 text-center">{e.billable ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  pct,
  tone,
  active,
  onSelect,
}: {
  label: string;
  value?: number;
  pct?: number;
  tone?: "success" | "danger" | "violet";
  active?: boolean;
  onSelect?: () => void;
}) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "violet" ? "text-violet-600" : "text-ink";

  const body = (
    <>
      <p className={cn("font-display text-[24px] font-extrabold leading-none tnum", color)}>{pct !== undefined ? `${pct}%` : formatINRCompact(value ?? 0)}</p>
      <p className="mt-1.5 text-[12px] text-muted">{label}</p>
    </>
  );

  // Derived metric (Margin) is non-interactive and visually softer.
  if (!onSelect) {
    return <Card className="p-4 bg-canvas/40">{body}</Card>;
  }

  // The button fills the whole card (incl. padding) so the entire affording surface is clickable.
  return (
    <Card
      className={cn(
        "cursor-pointer overflow-hidden transition-all hover:-translate-y-px hover:shadow-[var(--shadow-pop)]",
        active ? "border-violet-400 ring-2 ring-violet-200 shadow-[var(--shadow-pop)]" : "hover:border-line-strong",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className="block w-full p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-300"
      >
        {body}
      </button>
    </Card>
  );
}
