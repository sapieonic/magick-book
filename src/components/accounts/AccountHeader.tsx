"use client";
import { type ReactNode } from "react";
import { format } from "date-fns";
import { Money } from "@/components/ui/Money";
import { Panel } from "@/components/ui/Panel";
import { ProportionBar, segmentShares } from "@/components/ui/ProportionBar";
import { StatusPill } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { AccountDTO, AccountFinance, ExpenseDTO, InvoiceDTO } from "@/lib/types";
import { OverflowMenu, type MenuItem } from "./OverflowMenu";
import { daysOverdue, shortDate } from "./statement";

/** Name, status, the one-line facts and the account's actions. */
export function AccountHeader({ account, actions, menu }: { account: AccountDTO; actions: ReactNode; menu: MenuItem[] }) {
  const facts: ReactNode[] = [];
  if (account.customerSince) facts.push(`Customer since ${format(new Date(account.customerSince), "MMM yyyy")}`);
  if (account.ownerName) facts.push(`owned by ${account.ownerName}`);
  if (account.industry) facts.push(account.industry);
  if (account.plan) facts.push(`${account.plan} plan`);
  if (account.value > 0)
    facts.push(
      <>
        <Money value={account.value} className="font-medium text-ink-1" /> a month
      </>,
    );

  return (
    <Panel aria-label="Account" className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
          <h2 className="min-w-0 break-words text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-ink-1">{account.name}</h2>
          {account.deletedAt ? <StatusPill tone="lost">Archived</StatusPill> : <StatusPill status={account.status} />}
        </div>
        {facts.length > 0 && (
          <p className="tnum mt-1.5 text-[15px] text-ink-2">
            {facts.map((f, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {f}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {menu.length > 0 && <OverflowMenu label="More account actions" items={menu} />}
      </div>
    </Panel>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One side of the statement bar: coloured label with share, figure, caption. */
function Side({ label, tone, value, caption, end }: { label: string; tone: string; value: number; caption: string; end?: boolean }) {
  return (
    <div className={cn("min-w-0", end && "text-right")}>
      <div className={cn("text-[13px] font-medium", tone)}>{label}</div>
      <Money value={value} className="figure text-[22px]" />
      <div className="text-[13px] text-ink-3">{caption}</div>
    </div>
  );
}

/**
 * The account's signature: billed to date as one bar split into paid and
 * outstanding, with expenses and margin beside it.
 */
export function StatementBar({
  finance,
  invoices,
  expenses,
  onAddExpense,
}: {
  finance: AccountFinance;
  invoices: InvoiceDTO[];
  expenses: ExpenseDTO[];
  onAddExpense?: () => void;
}) {
  const paidInvoices = invoices.filter((i) => i.status === "paid");
  const open = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const lastPaid = paidInvoices.reduce<string | null>((max, i) => {
    const d = i.paidAt ?? i.issuedAt;
    return !max || d > max ? d : max;
  }, null);
  const worstDays = Math.max(0, ...open.map((i) => daysOverdue(i)));
  const late = worstDays > 0;
  const outstandingTone = late ? "text-overdue" : "text-due";
  const [paid, outstanding] = segmentShares([
    { key: "paid", label: "Paid", value: finance.paid, color: "var(--color-paid-fill)" },
    {
      key: "outstanding",
      label: "Outstanding",
      value: finance.outstanding,
      color: late ? "color-mix(in srgb, var(--color-overdue-fill) 55%, transparent)" : "var(--color-due-fill)",
    },
  ]);

  return (
    <Panel aria-label="Account statement summary" className="grid gap-x-10 gap-y-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="text-[13px] text-ink-3">Billed to date</span>
          <Money value={finance.billed} className="figure text-[40px]" />
        </div>
        <ProportionBar variant="bar" aria-label="Billed to date" segments={[paid, outstanding]} />
        <div className="mt-2.5 flex justify-between gap-4">
          <Side
            label={`Paid · ${paid.pct}%`}
            tone="text-paid"
            value={finance.paid}
            caption={paidInvoices.length ? `${plural(paidInvoices.length, "invoice")}, last on ${shortDate(lastPaid!)}` : "Nothing paid yet"}
          />
          <Side
            end
            label={`Outstanding · ${outstanding.pct}%`}
            tone={outstandingTone}
            value={finance.outstanding}
            caption={open.length ? `${plural(open.length, "invoice")}, ${late ? `${plural(worstDays, "day")} overdue` : "not yet due"}` : "Nothing owed"}
          />
        </div>
      </div>

      <dl className="flex min-w-0 flex-col justify-end gap-4 border-line max-xl:border-t max-xl:pt-4 xl:border-l xl:pl-8">
        <div>
          <dt className="text-[13px] text-ink-3">Expenses</dt>
          <dd className="flex flex-wrap items-baseline gap-x-2">
            <Money value={finance.expenses} className={cn("figure text-[22px]", !finance.expenses && "text-ink-3")} />
            <span className="text-[13px] text-ink-2">
              {expenses.length ? plural(expenses.length, "cost") + " recorded" : "None recorded for this account."}{" "}
              {onAddExpense && (
                <button type="button" onClick={onAddExpense} className="link">
                  Add expense
                </button>
              )}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-ink-3">Margin</dt>
          {finance.expenses > 0 ? (
            <dd className="flex flex-wrap items-baseline gap-x-2">
              <span className="figure text-[22px]">{Math.round(finance.margin * 100)}%</span>
              <span className="text-[13px] text-ink-2">
                <Money value={Math.max(0, finance.billed - finance.expenses)} /> kept after costs
              </span>
            </dd>
          ) : (
            <dd className="text-[13px] text-ink-2">No expenses recorded</dd>
          )}
        </div>
      </dl>
    </Panel>
  );
}
