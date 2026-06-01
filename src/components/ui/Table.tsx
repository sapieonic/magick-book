"use client";
import { useState, type ReactNode } from "react";
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
      className={cn(
        "group inline-flex items-center gap-1 font-semibold tracking-tight transition-colors hover:text-ink",
        active ? "text-ink" : "text-muted",
        align === "right" && "flex-row-reverse",
        className,
      )}
    >
      <span>{label}</span>
      <Icon className={cn("size-3.5 transition-opacity", active ? "opacity-100 text-violet-500" : "opacity-0 group-hover:opacity-60")} />
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
    <div className={cn("flex items-center justify-between gap-3 px-1 pt-3 text-[12.5px] text-muted", className)}>
      <span className="tnum">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </Button>
        <span className="tnum tabular-nums px-1 font-medium text-ink-soft">
          {page} / {pageCount}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
