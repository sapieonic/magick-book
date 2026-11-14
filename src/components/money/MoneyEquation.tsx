import { LinkButton } from "@/components/ui/Button";
import { type ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { Money, formatMoney } from "@/components/ui/Money";
import { cn, plural } from "@/lib/utils";
import type { LedgerFilter } from "@/lib/money-charts";
import type { MoneyTotals } from "@/lib/types";
import { marginFigures } from "./margin";

/**
 * Billed − Paid = Outstanding as large figures, with expenses and margin
 * quieter beside them. Each term narrows the ledger below.
 */
export function MoneyEquation({
  totals,
  filter,
  onFilter,
  onShowExpenses,
}: {
  totals: MoneyTotals;
  filter: LedgerFilter;
  onFilter: (filter: LedgerFilter) => void;
  onShowExpenses: () => void;
}) {
  const pick = (f: LedgerFilter) => onFilter(filter === f ? "all" : f);
  const overdue = totals.overdueCount > 0 ? `, ${totals.overdueCount} overdue` : "";
  const margin = marginFigures(totals);

  return (
    <Panel aria-label="Receivables equation">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-4 md:gap-x-7">
        <Term
          label="Billed"
          value={totals.billed}
          caption={plural(totals.billedCount, "invoice")}
          active={filter === "all"}
          onClick={() => onFilter("all")}
        />
        <Operator>−</Operator>
        <Term
          label="Paid"
          labelClassName="text-paid"
          value={totals.paid}
          caption={plural(totals.paidCount, "invoice")}
          active={filter === "paid"}
          onClick={() => pick("paid")}
        />
        <Operator>=</Operator>
        <Term
          label="Outstanding"
          labelClassName="text-overdue"
          value={totals.outstanding}
          caption={`${plural(totals.outstandingCount, "invoice")}${overdue}`}
          active={filter === "outstanding"}
          onClick={() => pick("outstanding")}
        />
        <div className="hidden flex-1 md:block" />
        <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1 pb-0.5 text-[13px] max-md:basis-full">
          <dt className="text-ink-3">Expenses</dt>
          <dd>
            {totals.expenses > 0 ? (
              <LinkButton onClick={onShowExpenses} aria-label={`Expenses ${formatMoney(totals.expenses)}, show them`}>
                <Money value={totals.expenses} />
              </LinkButton>
            ) : (
              <span className="text-ink-2">None recorded</span>
            )}
          </dd>
          <dt className="text-ink-3">Margin</dt>
          <dd className={margin.negative ? "text-overdue" : "text-ink-2"}>
            {totals.expenses > 0 ? (
              <span className="tnum">
                {margin.pct && `${margin.pct} · `}
                <Money value={margin.amount} compact /> after costs
              </span>
            ) : (
              "No expenses recorded"
            )}
          </dd>
        </dl>
      </div>
    </Panel>
  );
}

function Term({
  label,
  labelClassName,
  value,
  caption,
  active,
  onClick,
}: {
  label: string;
  labelClassName?: string;
  value: number;
  caption: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "-m-2 rounded-card p-2 text-left transition-colors",
        active ? "bg-sunk ring-1 ring-line-strong" : "hover:bg-hover",
      )}
    >
      <span className={cn("block text-[13px] font-medium", labelClassName ?? "text-ink-3")}>{label}</span>
      <Money value={value} compact className="figure block text-[40px] tracking-[-0.01em] md:text-[56px]" />
      <span className="mt-1.5 block text-[13px] text-ink-3">
        <Money value={value} /> · {caption}
      </span>
    </button>
  );
}

function Operator({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="figure pb-7 text-[40px] font-normal text-ink-3 max-md:hidden">
      {children}
    </span>
  );
}
