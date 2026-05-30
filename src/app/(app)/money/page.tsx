"use client";
import { useState } from "react";
import Link from "next/link";
import { Receipt, Wallet } from "lucide-react";
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

export default function MoneyPage() {
  const { data, loading, error, refresh } = useApi<MoneyData>("/api/money");
  const [tab, setTab] = useState<"invoices" | "expenses">("invoices");

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
            {/* Totals */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Stat label="Billed" value={data.totals.billed} />
              <Stat label="Paid" value={data.totals.paid} tone="success" />
              <Stat label="Outstanding" value={data.totals.outstanding} tone="danger" />
              <Stat label="Expenses" value={data.totals.expenses} />
              <Stat label="Margin" pct={Math.round(data.totals.margin * 100)} tone="violet" />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-line bg-paper p-1 w-fit">
              {(["invoices", "expenses"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 text-[12.5px] font-semibold capitalize transition-all",
                    tab === t ? "bg-violet-50 text-violet-700" : "text-muted hover:text-ink",
                  )}
                >
                  {t === "invoices" ? <Receipt className="size-4" /> : <Wallet className="size-4" />} {t}
                </button>
              ))}
            </div>

            {tab === "invoices" ? (
              data.invoices.length === 0 ? (
                <EmptyState icon={<Receipt className="size-6" />} title="No invoices yet" description="Bill an account from its Invoices tab." />
              ) : (
                <Card className="overflow-hidden">
                  <table className="w-full">
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
                      {data.invoices.map((inv) => (
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
                </Card>
              )
            ) : data.expenses.length === 0 ? (
              <EmptyState icon={<Wallet className="size-6" />} title="No expenses yet" description="Log costs from an account's Expenses tab." />
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full">
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
                    {data.expenses.map((e) => (
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
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, pct, tone }: { label: string; value?: number; pct?: number; tone?: "success" | "danger" | "violet" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "violet" ? "text-violet-600" : "text-ink";
  return (
    <Card className="p-4">
      <p className={cn("font-display text-[24px] font-extrabold leading-none tnum", color)}>{pct !== undefined ? `${pct}%` : formatINRCompact(value ?? 0)}</p>
      <p className="mt-1.5 text-[12px] text-muted">{label}</p>
    </Card>
  );
}
