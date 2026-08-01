"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Card } from "@/components/ui/Misc";
import { formatINR, formatINRCompact } from "@/lib/utils";
import {
  buildPaidByAccountMoM,
  buildOutstandingAging,
  accountColor,
  AGING_COLORS,
  type AgingBucket,
} from "@/lib/money-charts";
import type { InvoiceDTO } from "@/lib/types";

export function MoneyCharts({ invoices }: { invoices: InvoiceDTO[] }) {
  const paid = useMemo(() => buildPaidByAccountMoM(invoices), [invoices]);
  const aging = useMemo(() => buildOutstandingAging(invoices), [invoices]);
  const agingTotal = aging.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="overflow-hidden p-4 lg:col-span-3">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-[13.5px] font-semibold text-ink">Paid by account</h2>
            <p className="mt-0.5 text-[12px] text-muted">Month on month · last 6 months</p>
          </div>
          {paid.totalPaid > 0 && (
            <p className="font-mono text-[12.5px] font-semibold text-ink-soft tnum">
              {formatINRCompact(paid.totalPaid)}
            </p>
          )}
        </div>
        {paid.totalPaid === 0 ? (
          <ChartEmpty message="No paid invoices in the last 6 months." />
        ) : (
          <>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paid.months} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="#ece9e3" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#8b8893", fontSize: 11.5 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tick={{ fill: "#8b8893", fontSize: 11 }}
                    tickFormatter={(v: number) => formatINRCompact(v).replace("₹", "")}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(109, 92, 245, 0.06)" }}
                    content={<StackTooltip />}
                  />
                  {paid.accounts.map((account, i) => (
                    <Bar
                      key={account.key}
                      dataKey={account.key}
                      name={account.name}
                      stackId="paid"
                      fill={accountColor(i, account.key)}
                      radius={i === paid.accounts.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={36}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
              {paid.accounts.map((account, i) => (
                <li key={account.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                  <span
                    className="size-2 shrink-0 rounded-sm"
                    style={{ background: accountColor(i, account.key) }}
                  />
                  {account.name}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card className="overflow-hidden p-4 lg:col-span-2">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-[13.5px] font-semibold text-ink">Outstanding aging</h2>
            <p className="mt-0.5 text-[12px] text-muted">By days past due</p>
          </div>
          {agingTotal > 0 && (
            <p className="font-mono text-[12.5px] font-semibold text-danger tnum">
              {formatINRCompact(agingTotal)}
            </p>
          )}
        </div>
        {agingTotal === 0 ? (
          <ChartEmpty message="Nothing outstanding — every issued invoice is settled." />
        ) : (
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={aging}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
                barCategoryGap="22%"
              >
                <CartesianGrid horizontal={false} stroke="#ece9e3" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#8b8893", fontSize: 11 }}
                  tickFormatter={(v: number) => formatINRCompact(v).replace("₹", "")}
                />
                <YAxis
                  type="category"
                  dataKey="bucket"
                  width={78}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#4a4854", fontSize: 11.5 }}
                />
                <Tooltip cursor={{ fill: "rgba(27, 26, 31, 0.03)" }} content={<AgingTooltip />} />
                <Bar dataKey="amount" radius={[0, 3, 3, 0]} maxBarSize={22}>
                  {aging.map((row) => (
                    <Cell key={row.bucket} fill={AGING_COLORS[row.bucket as AgingBucket]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-[var(--radius-sm)] bg-canvas/50 px-4 text-center text-[12.5px] text-muted">
      {message}
    </div>
  );
}

function StackTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value > 0);
  if (!rows.length) return null;
  const total = rows.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-[var(--radius-sm)] border border-line bg-paper px-3 py-2 shadow-[var(--shadow-card)]">
      <p className="text-[11.5px] font-semibold text-ink">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((p) => (
          <li key={p.name} className="flex items-center justify-between gap-4 text-[11.5px]">
            <span className="inline-flex items-center gap-1.5 text-ink-soft">
              <span className="size-1.5 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-mono font-semibold text-ink tnum">{formatINR(p.value)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 border-t border-line pt-1.5 text-right font-mono text-[11.5px] font-semibold text-ink tnum">
        {formatINR(total)}
      </p>
    </div>
  );
}

function AgingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { bucket: string; amount: number; count: number } }>;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-[var(--radius-sm)] border border-line bg-paper px-3 py-2 shadow-[var(--shadow-card)]">
      <p className="text-[11.5px] font-semibold text-ink">{row.bucket}</p>
      <p className="mt-1 font-mono text-[12px] font-semibold text-ink tnum">{formatINR(row.amount)}</p>
      <p className="mt-0.5 text-[11px] text-muted">
        {row.count} invoice{row.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}
