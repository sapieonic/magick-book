"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Building2, RotateCcw, Archive, X } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { NewAccountModal } from "@/components/accounts/AccountModals";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PageLoader, ErrorState, EmptyState } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Time } from "@/components/ui/Time";
import { SortHeader, useSort, sortRows, usePagination, Pagination } from "@/components/ui/Table";
import { api, useApi } from "@/lib/client";
import { ACCOUNT_STATUS_META } from "@/lib/constants";
import { formatINRCompact, cn } from "@/lib/utils";
import type { AccountDTO } from "@/lib/types";

interface AccountsResponse {
  accounts: AccountDTO[];
  tabCounts: { all: number; active: number; at_risk: number; churned: number; archived: number };
}

const TABS = [
  { key: "", label: "All", countKey: "all" },
  { key: "active", label: "Active", countKey: "active" },
  { key: "at_risk", label: "At risk", countKey: "at_risk" },
  { key: "churned", label: "Churned", countKey: "churned" },
  { key: "archived", label: "Archived", countKey: "archived" },
] as const;

const SORT_ACCESSORS: Record<string, (a: AccountDTO) => string | number | null | undefined> = {
  name: (a) => a.name.toLowerCase(),
  contacts: (a) => a.contactCount,
  value: (a) => a.value,
  status: (a) => ACCOUNT_STATUS_META[a.status].label.toLowerCase(),
  lastActivity: (a) => (a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : null),
};

const EMPTY_COPY: Record<string, { title: string; description: string }> = {
  active: { title: "No active accounts", description: "Accounts in good standing will show up here." },
  at_risk: { title: "No at-risk accounts", description: "Accounts flagged as at risk will appear here." },
  churned: { title: "No churned accounts", description: "Accounts that have churned will be listed here." },
};

export default function AccountsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);

  const archivedView = status === "archived";
  const params = new URLSearchParams();
  if (archivedView) params.set("archived", "1");
  else if (status) params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  const url = `/api/accounts${params.toString() ? `?${params}` : ""}`;
  const { data, loading, error, refresh } = useApi<AccountsResponse>(url);
  const accounts = data?.accounts ?? [];

  const { sort, toggle } = useSort();
  const sorted = useMemo(() => sortRows(accounts, sort, SORT_ACCESSORS), [accounts, sort.key, sort.dir]);
  const { page, setPage, pageCount, pageRows, total, pageSize } = usePagination(sorted, 25);

  // Re-sorting or re-filtering should return to the first page.
  useEffect(() => setPage(1), [sort.key, sort.dir, q, status, setPage]);

  // Drop selections that no longer exist after a refresh/search (e.g. archived rows).
  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(accounts.map((a) => a.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [accounts]);

  const pageIds = pageRows.map((a) => a.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = pageIds.some((id) => selected.has(id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = !allSelected && someSelected;
  }, [allSelected, someSelected]);

  function clearSelection() {
    setSelected(new Set());
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function restore(id: string, name: string) {
    setRestoringId(id);
    try {
      await api.patch(`/api/accounts/${id}`, { action: "restore" });
      toast(`${name} restored.`, "success");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not restore", "error");
    } finally {
      setRestoringId(null);
    }
  }

  async function bulkArchive() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Archive ${ids.length} ${ids.length === 1 ? "account" : "accounts"}?`,
      description: "They will be hidden from the active lists. You can restore them anytime from the Archived view.",
      confirmLabel: "Archive",
      tone: "danger",
    });
    if (!ok) return;
    setArchiving(true);
    try {
      // allSettled so one failure doesn't strand the rest — some may have archived server-side.
      const results = await Promise.allSettled(ids.map((id) => api.delete(`/api/accounts/${id}`)));
      const failed = results.filter((r) => r.status === "rejected").length;
      const done = ids.length - failed;
      if (done > 0) toast(`${done} ${done === 1 ? "account" : "accounts"} archived.`, "success");
      if (failed > 0) toast(`${failed} couldn't be archived — try again.`, "error");
    } finally {
      // Always reconcile so the UI matches the server, regardless of partial failure.
      clearSelection();
      refresh();
      setArchiving(false);
    }
  }

  const emptyCopy = EMPTY_COPY[status];

  return (
    <>
      <PageHeader>
        <h1 className="font-display text-[22px] font-bold tracking-tight text-ink">Accounts</h1>

        <div className="ml-2 hidden items-center gap-1 md:flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setStatus(t.key); clearSelection(); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all",
                status === t.key ? "border-violet-300 bg-violet-50 text-violet-700" : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {t.label}
              <span className="text-faint tnum">{data?.tabCounts[t.countKey] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="relative ml-auto hidden max-w-xs flex-1 sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search accounts"
            className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-paper pl-9 pr-3 text-[13.5px] text-ink placeholder:text-faint focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-100"
          />
        </div>

        <Button variant="primary" onClick={() => setCreating(true)} className="ml-auto sm:ml-0">
          <Plus className="size-4" /> New account
        </Button>
      </PageHeader>

      <div className="px-6 py-6 lg:px-8">
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading ? (
          <PageLoader label="Loading accounts…" />
        ) : accounts.length === 0 ? (
          archivedView ? (
            <EmptyState
              icon={<Building2 className="size-6" />}
              title="Nothing archived"
              description="Accounts you archive will show up here and can be restored."
            />
          ) : q ? (
            <EmptyState
              icon={<Building2 className="size-6" />}
              title="No matching accounts"
              description="Try a different search or filter."
            />
          ) : emptyCopy ? (
            <EmptyState icon={<Building2 className="size-6" />} title={emptyCopy.title} description={emptyCopy.description} />
          ) : (
            <EmptyState
              icon={<Building2 className="size-6" />}
              title="No accounts yet"
              description="Convert a won lead, or create an account directly."
              action={<Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> New account</Button>}
            />
          )
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-line bg-canvas/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                    {!archivedView && (
                      <th className="w-10 px-5 py-3">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          aria-label="Select all accounts on this page"
                          checked={allSelected}
                          onChange={toggleAll}
                          className="size-4 cursor-pointer rounded border-line-strong accent-violet-600"
                        />
                      </th>
                    )}
                    <th className="px-5 py-3"><SortHeader label="Account" sortKey="name" sort={sort} onToggle={toggle} /></th>
                    <th className="px-5 py-3">Primary contact</th>
                    <th className="px-5 py-3 text-center"><SortHeader label="Contacts" sortKey="contacts" sort={sort} onToggle={toggle} /></th>
                    <th className="px-5 py-3 text-right"><SortHeader label="Value / MRR" sortKey="value" sort={sort} onToggle={toggle} align="right" /></th>
                    <th className="px-5 py-3"><SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} /></th>
                    <th className="px-5 py-3 text-right">
                      {archivedView ? "" : <SortHeader label="Last activity" sortKey="lastActivity" sort={sort} onToggle={toggle} align="right" />}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pageRows.map((a) => {
                    const meta = ACCOUNT_STATUS_META[a.status];
                    const isSelected = selected.has(a.id);
                    return (
                      <tr
                        key={a.id}
                        onClick={() => !archivedView && router.push(`/accounts/${a.id}`)}
                        className={cn(
                          "transition-colors",
                          archivedView ? "" : "cursor-pointer hover:bg-violet-50/40",
                          isSelected && "bg-violet-50/60",
                        )}
                      >
                        {!archivedView && (
                          <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${a.name}`}
                              checked={isSelected}
                              onChange={() => toggleRow(a.id)}
                              className="size-4 cursor-pointer rounded border-line-strong accent-violet-600"
                            />
                          </td>
                        )}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-violet-50 text-violet-600">
                              <Building2 className="size-4" />
                            </span>
                            <div>
                              <p className="text-[13.5px] font-semibold text-ink">{a.name}</p>
                              {a.domain && <p className="text-[11.5px] text-faint">{a.domain}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-ink-soft">
                          {a.primaryContact ? (
                            <span className="inline-flex items-center gap-2">
                              <Avatar name={a.primaryContact.name} size={22} /> {a.primaryContact.name}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono text-[13px] text-ink-soft tnum">{a.contactCount}</td>
                        <td className="px-5 py-3.5 text-right font-mono text-[13px] font-semibold text-ink tnum">{a.value > 0 ? `${formatINRCompact(a.value)}/mo` : "—"}</td>
                        <td className="px-5 py-3.5"><Badge tint={meta.tint}>{meta.label}</Badge></td>
                        <td className="px-5 py-3.5 text-right">
                          {archivedView ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={restoringId === a.id}
                              onClick={(e) => { e.stopPropagation(); restore(a.id, a.name); }}
                            >
                              <RotateCcw className="size-3.5" /> Restore
                            </Button>
                          ) : (
                            <Time value={a.lastActivityAt} className="text-[12.5px] text-faint" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </Card>
            <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} />
          </>
        )}
      </div>

      {!archivedView && selected.size > 0 && (
        <div className="fixed inset-x-0 z-50 mx-auto flex w-fit items-center gap-3 rounded-full border border-line bg-paper px-4 py-2.5 shadow-[var(--shadow-pop)] bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6">
          <span className="text-[13px] font-semibold text-ink tnum">{selected.size} selected</span>
          <span className="h-5 w-px bg-line" />
          <Button size="sm" variant="danger" loading={archiving} onClick={bulkArchive}>
            <Archive className="size-3.5" /> Archive
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            <X className="size-3.5" /> Clear
          </Button>
        </div>
      )}

      <NewAccountModal open={creating} onClose={() => setCreating(false)} onCreated={() => refresh()} />
    </>
  );
}
