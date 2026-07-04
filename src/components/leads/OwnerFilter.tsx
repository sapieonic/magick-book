"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Users, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { OwnerOption } from "@/lib/leadFilters";

export type { OwnerOption };

/**
 * Jira-style owner (assignee) filter. The trigger is an overlapping avatar stack;
 * clicking opens a searchable, multi-select popover. Selection is controlled by the
 * parent so it can drive the filter and persist to the URL.
 */
export function OwnerFilter({
  owners,
  value,
  onChange,
  currentUserId,
}: {
  owners: OwnerOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  currentUserId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Close on outside click / Escape — standard popover behaviour.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Focus the search box when the popover opens.
  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open]);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? owners.filter((o) => o.name.toLowerCase().includes(q)) : owners;
  }, [owners, query]);

  const selectedOwners = useMemo(() => owners.filter((o) => selectedSet.has(o.id)), [owners, selectedSet]);
  const isMineOnly = currentUserId != null && value.length === 1 && value[0] === currentUserId;
  const canFilterMine = currentUserId != null && owners.some((o) => o.id === currentUserId);

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border px-2.5 text-[13px] font-semibold transition-colors focus:outline-none focus:ring-4 focus:ring-violet-100 dark:focus:ring-violet-900/40",
          value.length > 0
            ? "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-900/30 dark:text-violet-200"
            : "border-line bg-canvas/60 text-muted hover:text-ink dark:bg-canvas/40",
        )}
      >
        {value.length > 0 ? (
          <>
            {selectedOwners.length > 0 ? <AvatarStack owners={selectedOwners} /> : <Users className="size-4" />}
            <span className="hidden sm:inline">
              {value.length === 1 && selectedOwners.length === 1
                ? selectedOwners[0].name
                : `${value.length} owner${value.length === 1 ? "" : "s"}`}
            </span>
          </>
        ) : (
          <>
            <Users className="size-4" />
            <span className="hidden sm:inline">Owner</span>
          </>
        )}
        <ChevronDown className={cn("size-3.5 opacity-60 transition-transform", open && "rotate-180")} />
      </button>

      {value.length > 0 && (
        <button
          type="button"
          aria-label="Clear owner filter"
          onClick={() => onChange([])}
          className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-violet-600 text-white shadow-sm transition-colors hover:bg-violet-700"
        >
          <X className="size-2.5" strokeWidth={3} />
        </button>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable
          className="absolute right-0 z-50 mt-2 w-72 origin-top-right animate-slide-in overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper shadow-[var(--shadow-pop)] ring-1 ring-black/5 dark:ring-white/5"
        >
          <div className="border-b border-line p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by owner…"
                className="h-8 w-full rounded-[var(--radius-md)] border border-line bg-canvas/60 pl-8 pr-2 text-[13px] text-ink placeholder:text-faint focus:border-violet-400 focus:bg-paper focus:outline-none dark:bg-canvas/40"
              />
            </div>
          </div>

          {canFilterMine && (
            <button
              type="button"
              onClick={() => onChange(isMineOnly ? [] : [currentUserId!])}
              className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-[12.5px] font-semibold text-violet-700 transition-colors hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-900/20"
            >
              <Check className={cn("size-3.5", isMineOnly ? "opacity-100" : "opacity-0")} />
              Only my leads
            </button>
          )}

          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-[12.5px] text-faint">No owners match “{query}”.</li>
            ) : (
              filtered.map((o) => {
                const checked = selectedSet.has(o.id);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggle(o.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-violet-50/70 dark:hover:bg-violet-900/20"
                    >
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded border transition-colors",
                          checked ? "border-violet-600 bg-violet-600 text-white" : "border-line-strong",
                        )}
                      >
                        {checked && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <Avatar name={o.name} size={24} />
                      <span className="flex-1 truncate text-[13px] font-medium text-ink">{o.name}</span>
                      <span className="tnum text-[11.5px] font-semibold text-faint">{o.count}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {value.length > 0 && (
            <div className="border-t border-line p-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-md)] py-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <X className="size-3.5" /> Clear {value.length} {value.length === 1 ? "filter" : "filters"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Overlapping avatars, capped at three with a "+N" bubble for the rest. */
function AvatarStack({ owners }: { owners: OwnerOption[] }) {
  const shown = owners.slice(0, 3);
  const extra = owners.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((o) => (
        <span key={o.id} className="rounded-full ring-2 ring-paper dark:ring-canvas">
          <Avatar name={o.name} size={20} />
        </span>
      ))}
      {extra > 0 && (
        <span className="grid size-5 place-items-center rounded-full bg-violet-600 text-[10px] font-bold text-white ring-2 ring-paper dark:ring-canvas">
          +{extra}
        </span>
      )}
    </span>
  );
}
