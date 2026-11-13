"use client";
import { useState, type HTMLAttributes, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export type SortDir = "asc" | "desc";
export interface SortState {
  key: string | null;
  dir: SortDir;
}

/** Column header sort state. Clicking the active column flips direction. */
export function useSort(initialKey: string | null = null, initialDir: SortDir = "desc") {
  const [sort, setSort] = useState<SortState>({ key: initialKey, dir: initialDir });
  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  return { sort, toggle };
}

type Accessor<T> = (row: T) => string | number | null | undefined;

/** Stable sort of `rows` by the active key, resolving values via `accessors`. Nulls sort last. */
export function sortRows<T>(rows: T[], sort: SortState, accessors: Record<string, Accessor<T>>): T[] {
  if (!sort.key) return rows;
  const acc = accessors[sort.key];
  if (!acc) return rows;
  const mult = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = acc(a);
    const bv = acc(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });
}

/** Clickable column header that shows the current sort direction. */
export function SortHeader({
  label,
  sortKey,
  sort,
  onToggle,
  align = "left",
  className,
}: {
  label: ReactNode;
  sortKey: string;
  sort: SortState;
  onToggle: (key: string) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      aria-label={typeof label === "string" ? `Sort by ${label}` : undefined}
      className={cn(
        "group inline-flex items-center gap-1 font-medium transition-colors hover:text-ink-1",
        active ? "text-ink-1" : "text-ink-3",
        align === "right" && "flex-row-reverse",
        className,
      )}
    >
      <span>{label}</span>
      <Icon className={cn("size-3.5", active ? "text-accent" : "opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60")} strokeWidth={1.5} aria-hidden />
    </button>
  );
}

/** Client-side pagination over an in-memory list. Page clamps if the list shrinks. */
export function usePagination<T>(rows: T[], pageSize = 25) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { page: safePage, setPage, pageCount, pageRows, total: rows.length, pageSize };
}

/** Footer control for `usePagination`. Renders nothing when there is a single page. */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  className,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cn("flex items-center justify-between gap-3 pt-3 text-[13px] text-ink-3", className)}>
      <span className="tnum">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </Button>
        <span className="tnum px-1 font-medium text-ink-2">
          {page} / {pageCount}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/**
 * Ledger table: 40px rows, hairline rules, right-aligned numeric cells. Scrolls
 * sideways when cramped; pass `maxHeight` to scroll vertically under a sticky head.
 */
export function Table({
  children,
  maxHeight,
  className,
  ...props
}: HTMLAttributes<HTMLTableElement> & { maxHeight?: number | string }) {
  return (
    <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
      <table className={cn("ledger", maxHeight && "ledger-sticky", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

interface CellProps {
  /** Right-aligned tabular figures. */
  numeric?: boolean;
  /** Drop the column on phones; fold its content into a `TwoLine` cell instead. */
  hideOnPhone?: boolean;
}

const cellClass = ({ numeric, hideOnPhone }: CellProps, className?: string) =>
  cn(numeric && "num", hideOnPhone && "max-md:hidden", className);

export function Th({ numeric, hideOnPhone, className, scope = "col", ...props }: ThHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return <th scope={scope} className={cellClass({ numeric, hideOnPhone }, className)} {...props} />;
}

export function Td({ numeric, hideOnPhone, className, ...props }: TdHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return <td className={cellClass({ numeric, hideOnPhone }, className)} {...props} />;
}

/**
 * Two-line cell content: a primary line over a muted secondary line. With
 * `phoneOnly` the second line appears only on phones, carrying what the hidden
 * columns showed.
 */
export function TwoLine({
  primary,
  secondary,
  phoneOnly,
  className,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  phoneOnly?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 py-2", className)}>
      <div className="font-medium text-ink-1">{primary}</div>
      {secondary && <div className={cn("text-[13px] text-ink-3", phoneOnly && "md:hidden")}>{secondary}</div>}
    </div>
  );
}
