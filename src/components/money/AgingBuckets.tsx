import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Money, formatMoney } from "@/components/ui/Money";
import { segmentShares } from "@/components/ui/ProportionBar";
import { AGING_COLORS, AGING_LABELS } from "@/lib/receivables";
import { cn } from "@/lib/utils";
import type { AgingBucketDTO, AgingKey } from "@/lib/types";

/** Smallest share of the row a band keeps, so its figures stay legible. */
const MIN_GROW = 0.14;

function accountsLine(accounts: string[]): string {
  if (accounts.length <= 2) return accounts.join(", ");
  return `${accounts.slice(0, 2).join(", ")} +${accounts.length - 2} more`;
}

/**
 * Outstanding money by days past due. Each band's width follows its amount;
 * selecting one narrows the ledger to it.
 */
export function AgingBuckets({
  aging,
  selected,
  onSelect,
}: {
  aging: AgingBucketDTO[];
  selected: AgingKey | null;
  onSelect: (key: AgingKey | null) => void;
}) {
  const shares = segmentShares(aging.map((b) => ({ ...b, label: AGING_LABELS[b.key], color: AGING_COLORS[b.key], value: b.amount })));
  const owed = aging.some((b) => b.count > 0);

  return (
    <Panel
      title="Outstanding by age"
      meta={owed ? "select a band to filter the ledger" : undefined}
      actions={
        selected ? (
          <Button size="sm" variant="ghost" onClick={() => onSelect(null)}>
            Show all ages
          </Button>
        ) : (
          <span className="text-ink-3">Days past due date</span>
        )
      }
    >
      {!owed ? (
        <p className="py-2 text-[13px] text-ink-2">Nothing outstanding. Every issued invoice is paid.</p>
      ) : (
        <div className="flex flex-wrap items-start gap-0.5">
          {shares.map((b) => {
            const empty = b.count === 0;
            const active = selected === b.key;
            return (
              <button
                key={b.key}
                type="button"
                aria-pressed={active}
                disabled={empty}
                onClick={() => onSelect(active ? null : b.key)}
                style={{ flexGrow: Math.max(b.share, MIN_GROW) }}
                className={cn(
                  "min-w-[132px] basis-0 rounded-card p-2 pb-2.5 text-left transition-colors max-md:min-w-[calc(50%-2px)]",
                  active ? "bg-sunk ring-1 ring-line-strong" : "enabled:hover:bg-hover",
                )}
              >
                <span
                  aria-hidden
                  className={cn("block h-2 rounded-bar transition-opacity", empty && "bg-sunk", selected && !active && "opacity-40")}
                  style={empty ? undefined : { background: b.color }}
                />
                <span
                  className={cn(
                    "mt-2.5 block text-[13px] font-medium",
                    empty ? "text-ink-3" : b.key === "current" ? "text-due" : "text-overdue",
                  )}
                >
                  {b.label}
                  {b.key !== "current" && <span className="sr-only"> overdue</span>}
                </span>
                <Money value={b.amount} className="figure block text-[22px] leading-[1.25]" />
                <span className="block text-[13px] text-ink-3">
                  {empty ? (
                    "Nothing here"
                  ) : (
                    <>
                      {b.count} invoice{b.count === 1 ? "" : "s"} · {b.pct}% of what is owed
                      {b.accounts.length > 0 && <> · {accountsLine(b.accounts)}</>}
                    </>
                  )}
                </span>
                {active && <span className="sr-only">, showing {formatMoney(b.amount)} in the ledger</span>}
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
