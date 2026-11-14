"use client";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, CornerDownLeft, Search, User, UserPlus, type LucideIcon } from "lucide-react";
import { Portal, Scrim, useDialog } from "@/components/ui/Overlay";
import { KbdHint } from "@/components/ui/Misc";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { AccountDTO, LeadDTO } from "@/lib/types";
import { useSession } from "./SessionContext";
import { NAV, SETTINGS_NAV } from "./nav";

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

const MIN_QUERY = 2;
const MAX_PER_GROUP = 6;
const DEBOUNCE_MS = 180;

/**
 * ⌘K palette: jump to a page, start a new lead, or search leads and accounts
 * (through the list APIs, so results are RBAC-scoped). Combobox + listbox
 * semantics; ↑/↓ move, Enter runs, Esc closes, Tab stays inside.
 */
export function CommandPalette({ open, onClose, onNewLead }: { open: boolean; onClose: () => void; onNewLead: () => void }) {
  if (!open) return null;
  return (
    <Portal>
      <PaletteDialog onClose={onClose} onNewLead={onNewLead} />
    </Portal>
  );
}

function PaletteDialog({ onClose, onNewLead }: { onClose: () => void; onNewLead: () => void }) {
  const router = useRouter();
  const user = useSession();
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; leads: LeadDTO[]; accounts: AccountDTO[] } | null>(null);
  const [active, setActive] = useState(0);

  const term = query.trim();
  const searching = term.length >= MIN_QUERY;

  useEffect(() => {
    if (!searching) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const q = encodeURIComponent(term);
      const [leads, accounts] = await Promise.all([
        api.get<{ leads: LeadDTO[] }>(`/api/leads?q=${q}`).then((r) => r.leads, () => []),
        api.get<{ accounts: AccountDTO[] }>(`/api/accounts?q=${q}`).then((r) => r.accounts, () => []),
      ]);
      if (!stale) setFound({ query: term, leads: leads.slice(0, MAX_PER_GROUP), accounts: accounts.slice(0, MAX_PER_GROUP) });
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [term, searching]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      onClose();
      router.push(href);
    };
    const pages = user.role === "admin" ? [...NAV, SETTINGS_NAV] : NAV;
    const fixed: Command[] = [
      { id: "new-lead", group: "Actions", label: "New lead", icon: UserPlus, run: () => { onClose(); onNewLead(); } },
      ...pages.map((p) => ({ id: `go-${p.href}`, group: "Go to", label: p.label, icon: p.icon, run: go(p.href) })),
    ];
    const needle = term.toLowerCase();
    const matches = needle ? fixed.filter((c) => c.label.toLowerCase().includes(needle)) : fixed;
    if (!searching || !found) return matches;
    return [
      ...matches,
      ...found.leads.map((l) => ({ id: `lead-${l.id}`, group: "Leads", label: l.name, hint: l.company || undefined, icon: User, run: go(`/leads/${l.id}`) })),
      ...found.accounts.map((a) => ({ id: `account-${a.id}`, group: "Accounts", label: a.name, hint: a.industry || undefined, icon: Building2, run: go(`/accounts/${a.id}`) })),
    ];
  }, [term, searching, found, user.role, router, onClose, onNewLead]);

  const pending = searching && found?.query !== term;
  const current = Math.min(active, commands.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(() => setActive(0), [term, found]);
  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView?.({ block: "nearest" });
  }, [listId, current]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const last = commands.length - 1;
    const move = (to: number) => {
      e.preventDefault();
      setActive(to);
    };
    if (e.key === "ArrowDown") move(current >= last ? 0 : current + 1);
    else if (e.key === "ArrowUp") move(current <= 0 ? last : current - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if (e.key === "Enter") {
      e.preventDefault();
      commands[current]?.run();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-[12vh]">
      <Scrim onClose={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
        className="glass-pop relative flex max-h-[min(70dvh,520px)] w-full max-w-[560px] animate-rise flex-col overflow-hidden rounded-panel outline-none"
      >
        <div className="flex items-center gap-2.5 border-b border-line-strong px-4">
          <Search className="size-[18px] shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-label="Search or jump to"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={commands.length ? optionId(current) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search leads and accounts, or jump to…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink-1 outline-none placeholder:text-ink-3"
          />
          <KbdHint>esc</KbdHint>
        </div>

        <div id={listId} role="listbox" aria-label="Results" className="flex-1 overflow-y-auto p-2">
          {commands.map((c, i) => (
            <div key={c.id}>
              {c.group !== commands[i - 1]?.group && (
                <div role="presentation" className="px-2 pb-1 pt-2 text-[12px] font-medium text-ink-3">
                  {c.group}
                </div>
              )}
              <div
                id={optionId(i)}
                role="option"
                aria-selected={i === current}
                onMouseMove={() => setActive(i)}
                onClick={c.run}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-control px-2 py-[7px]",
                  i === current ? "bg-accent-tint text-accent" : "text-ink-1",
                )}
              >
                <c.icon className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden />
                <span className="truncate font-medium">{c.label}</span>
                {c.hint && <span className="truncate text-[13px] text-ink-3">{c.hint}</span>}
                {i === current && <CornerDownLeft className="ml-auto size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
              </div>
            </div>
          ))}
          <p role="status" className={cn("px-2 py-3 text-[13px] text-ink-3", !pending && commands.length > 0 && "sr-only")}>
            {pending ? "Searching…" : commands.length === 0 ? `No matches for “${term}”` : `${commands.length} results`}
          </p>
        </div>
      </div>
    </div>
  );
}
