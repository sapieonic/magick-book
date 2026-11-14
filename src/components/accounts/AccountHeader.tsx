"use client";
import { type ReactNode } from "react";
import { LinkButton } from "@/components/ui/Button";
import { Money, formatMoney } from "@/components/ui/Money";
import { Panel } from "@/components/ui/Panel";
import { ProportionBar, segmentShares } from "@/components/ui/ProportionBar";
import { StatusPill } from "@/components/ui/Badge";
import { OverflowMenu, type MenuItem } from "@/components/ui/OverflowMenu";
import { marginFigures } from "@/components/money/margin";
import { monthYear, shortDate } from "@/lib/dates";
import { daysPastDue, isOutstanding, isOverdue, paymentDate } from "@/lib/receivables";
import type { AccountDTO, AccountFinance, ExpenseDTO, InvoiceDTO } from "@/lib/types";
import { cn, plural } from "@/lib/utils";

/** Name, status, the one-line facts and the account's actions. */
export function AccountHeader({ account, actions, menu }: { account: AccountDTO; actions: ReactNode; menu: MenuItem[] }) {
  const facts: ReactNode[] = [];
  if (account.customerSince) facts.push(`Customer since ${monthYear(account.customerSince)}`);
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
      {/* Phones: the actions share one full-width row, the menu keeps its square. */}
      <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:flex-nowrap max-md:[&>button]:min-w-0 max-md:[&>button]:flex-1 max-md:[&>button]:px-2">
        {actions}
        {menu.length > 0 && <OverflowMenu label="More account actions" items={menu} />}
      </div>
    </Panel>
  );
}

/** One side of the statement bar: coloured label with share, figure, caption. */
function Side({ label, tone, value, caption, end }: { label: string; tone: string; value: number; caption: string; end?: boolean }) {
  return (
    <div className={cn("min-w-0", end && "text-right")}>
      <div className={cn("text-[13px] font-medium", tone)}>{label}</div>
      <Money value={value} className="figure text-[22px]" />
      <div className="min-h-[1lh] text-[13px] text-ink-3">{caption}</div>
    </div>
  );
}

const total = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

/**
 * Captions under the statement figures. The figures are the server rollup;
 * the lists only add detail. "Nothing" is said only when the figure is zero,
 * and a count only when the list adds up to the figure, so a caption can
 * never contradict the number above it (say, while a list is still loading).
 */
function captions(finance: AccountFinance, invoices: InvoiceDTO[], expenses: ExpenseDTO[], now: Date) {
  const paid = invoices.filter((i) => i.status === "paid");
  const open = invoices.filter(isOutstanding);
  const lastPaid = paid.reduce<Date | null>((max, i) => {
    const d = paymentDate(i)!;
    return !max || d > max ? d : max;
  }, null);
  const worstDays = Math.max(0, ...open.map((i) => daysPastDue(i, now)));
  const owedWhen = open.some((i) => isOverdue(i, now)) ? (worstDays > 0 ? `${plural(worstDays, "day")} overdue` : "overdue") : "not yet due";

  return {
    paid: !finance.paid ? "Nothing paid yet" : total(paid) === finance.paid && lastPaid ? `${plural(paid.length, "invoice")}, last on ${shortDate(lastPaid, "auto", now)}` : "",
    outstanding: !finance.outstanding
      ? "Nothing owed"
      : total(open) === finance.outstanding
        ? `${plural(open.length, "invoice")}, ${owedWhen}`
        : finance.overdue
          ? `${formatMoney(finance.overdue)} overdue`
          : "Not yet due",
    expenses: !finance.expenses ? "None recorded for this account." : total(expenses) === finance.expenses ? `${plural(expenses.length, "cost")} recorded.` : "",
  };
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
  const caption = captions(finance, invoices, expenses, new Date());
  const margin = marginFigures(finance);
  const late = finance.overdue > 0;
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
        <ProportionBar variant="bar" size="md" aria-label="Billed to date" segments={[paid, outstanding]} />
        <div className="mt-2.5 flex justify-between gap-4">
          <Side label={`Paid · ${paid.pct}%`} tone="text-paid" value={finance.paid} caption={caption.paid} />
          <Side end label={`Outstanding · ${outstanding.pct}%`} tone={late ? "text-overdue" : "text-due"} value={finance.outstanding} caption={caption.outstanding} />
        </div>
      </div>

      <dl className="flex min-w-0 flex-col justify-end gap-4 border-line max-xl:border-t max-xl:pt-4 xl:border-l xl:pl-8">
        <div>
          <dt className="text-[13px] text-ink-3">Expenses</dt>
          <dd className="flex flex-wrap items-baseline gap-x-2">
            <Money value={finance.expenses} className={cn("figure text-[22px]", !finance.expenses && "text-ink-3")} />
            <span className="text-[13px] text-ink-2">
              {caption.expenses} {onAddExpense && <LinkButton onClick={onAddExpense}>Add expense</LinkButton>}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-ink-3">Margin</dt>
          {finance.expenses > 0 ? (
            <dd className={cn("flex flex-wrap items-baseline gap-x-2", margin.negative ? "text-overdue" : "text-ink-2")}>
              {margin.pct && <span className={cn("figure text-[22px]", !margin.negative && "text-ink-1")}>{margin.pct}</span>}
              <span className="text-[13px]">
                <Money value={margin.amount} /> after costs
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
