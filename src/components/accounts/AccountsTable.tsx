"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Money, formatMoney } from "@/components/ui/Money";
import { StatusPill, STATUS_META } from "@/components/ui/Badge";
import { SortHeader, Table, Td, Th, TwoLine, type SortState } from "@/components/ui/Table";
import { Time } from "@/components/ui/Time";
import { cn } from "@/lib/utils";
import type { AccountListItem } from "@/lib/types";

export const ACCOUNT_SORT: Record<string, (a: AccountListItem) => string | number | null> = {
  name: (a) => a.name.toLowerCase(),
  owner: (a) => a.ownerName.toLowerCase(),
  value: (a) => a.value,
  billed: (a) => a.finance.billed,
  paid: (a) => a.finance.paid,
  outstanding: (a) => a.finance.outstanding,
  lastActivity: (a) => new Date(a.lastActivityAt).getTime(),
  status: (a) => STATUS_META[a.status].label,
};

/** Outstanding figure; turns overdue red with the overdue square when any of it is past due. */
export function Outstanding({ amount, overdue, className }: { amount: number; overdue: number; className?: string }) {
  if (overdue <= 0) return <Money value={amount} className={className} />;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-overdue", className)} title={`${formatMoney(overdue)} overdue`}>
      <span className="size-[7px] shrink-0 bg-overdue-fill" aria-hidden />
      <Money value={amount} />
      <span className="sr-only">, {formatMoney(overdue)} overdue</span>
    </span>
  );
}

/** Plan name and monthly value, e.g. "Starter · ₹50,000/mo". */
function PlanValue({ plan, value }: { plan: string; value: number }) {
  if (!plan && !value) return <span className="text-ink-3">–</span>;
  return (
    <span className="whitespace-nowrap">
      {plan && <span className="text-ink-2">{plan}</span>}
      {plan && value > 0 && <span className="text-ink-3"> · </span>}
      {value > 0 && (
        <>
          <Money value={value} />
          <span className="text-ink-3">/mo</span>
        </>
      )}
    </span>
  );
}

interface Selection {
  ids: Set<string>;
  toggle: (id: string) => void;
  /** Select (`on`) or clear all of `ids`. */
  set: (ids: string[], on: boolean) => void;
}

/**
 * The accounts ledger. `rows` is the current page; `all` feeds the total row
 * so it always sums the whole filtered set. Archived rows trade the checkbox and
 * status for a Restore button.
 */
export function AccountsTable({
  rows,
  all,
  archived,
  sort,
  onSort,
  selection,
  restoringId,
  onRestore,
}: {
  rows: AccountListItem[];
  all: AccountListItem[];
  archived: boolean;
  sort: SortState;
  onSort: (key: string) => void;
  selection: Selection;
  restoringId: string | null;
  onRestore: (a: AccountListItem) => void;
}) {
  const router = useRouter();
  const allSelected = rows.length > 0 && rows.every((a) => selection.ids.has(a.id));
  const someSelected = rows.some((a) => selection.ids.has(a.id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  const sum = (pick: (a: AccountListItem) => number) => all.reduce((s, a) => s + pick(a), 0);
  const head = (label: string, key: string, numeric = false) => (
    <SortHeader label={label} sortKey={key} sort={sort} onToggle={onSort} align={numeric ? "right" : "left"} />
  );

  return (
    <Table>
      <thead>
        <tr>
          {!archived && (
            <Th hideOnPhone className="w-8">
              <input
                ref={selectAllRef}
                type="checkbox"
                aria-label="Select every account on this page"
                checked={allSelected}
                onChange={() => selection.set(rows.map((a) => a.id), !allSelected)}
                className="size-4 cursor-pointer accent-accent"
              />
            </Th>
          )}
          <Th>{head("Account", "name")}</Th>
          <Th hideOnPhone>{head("Owner", "owner")}</Th>
          <Th hideOnPhone>{head("Plan or value", "value")}</Th>
          <Th numeric hideOnPhone>{head("Billed", "billed", true)}</Th>
          <Th numeric hideOnPhone>{head("Paid", "paid", true)}</Th>
          <Th numeric>{head("Outstanding", "outstanding", true)}</Th>
          <Th hideOnPhone>{head("Last activity", "lastActivity")}</Th>
          <Th hideOnPhone>{archived ? <span className="sr-only">Actions</span> : head("Status", "status")}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => {
          const href = `/accounts/${a.id}`;
          const checked = selection.ids.has(a.id);
          return (
            <tr
              key={a.id}
              onClick={() => router.push(href)}
              className={cn("cursor-pointer transition-colors hover:bg-hover", checked && "bg-accent-tint")}
            >
              {!archived && (
                <Td hideOnPhone onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${a.name}`}
                    checked={checked}
                    onChange={() => selection.toggle(a.id)}
                    className="size-4 cursor-pointer accent-accent"
                  />
                </Td>
              )}
              <Td className="max-w-[280px]">
                <TwoLine
                  phoneOnly
                  primary={
                    <Link href={href} onClick={(e) => e.stopPropagation()} className="block truncate hover:underline">
                      {a.name}
                    </Link>
                  }
                  secondary={`${STATUS_META[a.status].label} · ${a.ownerName || "No owner"}`}
                />
              </Td>
              <Td hideOnPhone className="text-ink-2">
                {a.ownerName || "–"}
              </Td>
              <Td hideOnPhone>
                <PlanValue plan={a.plan} value={a.value} />
              </Td>
              <Td numeric hideOnPhone>
                <Money value={a.finance.billed} />
              </Td>
              <Td numeric hideOnPhone>
                <Money value={a.finance.paid} />
              </Td>
              <Td numeric>
                <Outstanding amount={a.finance.outstanding} overdue={a.finance.overdue} />
              </Td>
              <Td hideOnPhone className="whitespace-nowrap text-ink-2">
                <Time value={a.lastActivityAt} />
              </Td>
              <Td hideOnPhone className={archived ? "text-right" : undefined}>
                {archived ? (
                  <Button
                    size="sm"
                    loading={restoringId === a.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore(a);
                    }}
                  >
                    <RotateCcw className="size-3.5" strokeWidth={1.5} aria-hidden /> Restore
                  </Button>
                ) : (
                  <StatusPill status={a.status} />
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="total">
          <Td hideOnPhone colSpan={archived ? 1 : 2}>
            Total · <span className="tnum">{all.length}</span> {all.length === 1 ? "account" : "accounts"}
          </Td>
          <Td className="md:hidden">Total</Td>
          <Td hideOnPhone colSpan={2} />
          <Td numeric hideOnPhone>
            <Money value={sum((a) => a.finance.billed)} />
          </Td>
          <Td numeric hideOnPhone>
            <Money value={sum((a) => a.finance.paid)} />
          </Td>
          <Td numeric>
            <Money value={sum((a) => a.finance.outstanding)} />
          </Td>
          <Td hideOnPhone colSpan={2} />
        </tr>
      </tfoot>
    </Table>
  );
}
