"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Users, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import type { OwnerOption } from "@/lib/leadFilters";

export type { OwnerOption };

const POPOVER_WIDTH = 288;

/**
 * Owner (assignee) filter for the top bar. The trigger shows the selection as
 * an avatar stack and a name or count; clicking opens a searchable, multi-select
 * popover. Selection is controlled by the
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
  // The popover hangs from the trigger's right edge unless that would push it off the left of the screen.
  const [alignLeft, setAlignLeft] = useState(false);
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

  const valueLabel =
    value.length === 0
      ? "Everyone"
      : value.length === 1 && selectedOwners.length === 1
        ? selectedOwners[0].name
        : `${value.length} owner${value.length === 1 ? "" : "s"}`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const rect = rootRef.current?.getBoundingClientRect();
          setAlignLeft(rect != null && rect.right < POPOVER_WIDTH + 12);
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-active={value.length > 0}
        className={cn(
          "inline-flex h-[34px] max-w-56 items-center gap-2 max-md:h-11 rounded-control border px-2.5 text-[13px] font-medium transition-colors",
          value.length > 0 ? "border-accent bg-accent-tint text-ink-1" : "border-line-strong bg-control text-ink-1 hover:bg-hover",
        )}
      >
        {selectedOwners.length > 0 ? <AvatarStack owners={selectedOwners} /> : <Users className="size-4 text-ink-3" strokeWidth={1.5} aria-hidden />}
        <span className="font-normal text-ink-3 max-md:sr-only">Owner</span>
        <span className="truncate">{valueLabel}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} strokeWidth={1.5} aria-hidden />
      </button>

      {value.length > 0 && (
        <button
          type="button"
          aria-label="Clear owner filter"
          onClick={() => onChange([])}
          className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-ink-1 text-on-ink"
        >
          <X className="size-2.5" strokeWidth={3} aria-hidden />
        </button>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable
          aria-label="Owners"
          style={{ width: POPOVER_WIDTH }}
          className={cn(
            "absolute z-50 mt-2 max-w-[calc(100vw-24px)] animate-rise overflow-hidden rounded-card border border-line-strong bg-surface shadow-pop",
            alignLeft ? "left-0" : "right-0",
          )}
        >
          <div className="border-b border-line p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" strokeWidth={1.5} aria-hidden />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Filter owners"
                placeholder="Filter by owner…"
                className="h-8 pl-8 text-[13px]"
              />
            </div>
          </div>

          {canFilterMine && (
            <button
              type="button"
              onClick={() => onChange(isMineOnly ? [] : [currentUserId!])}
              className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-[13px] font-medium text-ink-1 transition-colors hover:bg-hover"
            >
              <Check className={cn("size-4", isMineOnly ? "opacity-100" : "opacity-0")} strokeWidth={1.5} aria-hidden />
              Only my leads
            </button>
          )}

          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-[13px] text-ink-3">No owners match “{query}”.</li>
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
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-hover"
                    >
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors",
                          checked ? "border-accent bg-accent text-on-ink" : "border-line-strong",
                        )}
                        aria-hidden
                      >
                        {checked && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <Avatar name={o.name} size={24} />
                      <span className="flex-1 truncate text-[13px] text-ink-1">{o.name}</span>
                      <span className="tnum text-[12px] text-ink-3">{o.count}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {value.length > 0 && (
            <div className="border-t border-line p-2">
              <Button variant="ghost" size="sm" onClick={() => onChange([])} className="w-full">
                <X className="size-4" strokeWidth={1.5} aria-hidden /> Clear {value.length} {value.length === 1 ? "filter" : "filters"}
              </Button>
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
        <span key={o.id} className="rounded-full ring-2 ring-surface">
          <Avatar name={o.name} size={20} />
        </span>
      ))}
      {extra > 0 && (
        <span className="tnum grid size-5 place-items-center rounded-full bg-ink-1 text-[10px] font-semibold text-on-ink ring-2 ring-surface">
          +{extra}
        </span>
      )}
    </span>
  );
}
