"use client";
import { useEffect, useMemo, useState } from "react";
import { Archive, Building2, Plus, Search, X } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccountsTable, ACCOUNT_SORT } from "@/components/accounts/AccountsTable";
import { NewAccountModal } from "@/components/accounts/AccountModals";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { OwnerFilter } from "@/components/ui/OwnerFilter";
import { useSession } from "@/components/layout/SessionContext";
import { EmptyState, ErrorState, RowsSkeleton, Skeleton } from "@/components/ui/Misc";
import { Money } from "@/components/ui/Money";
import { Portal } from "@/components/ui/Overlay";
import { Panel } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Pagination, sortRows, usePagination, useSort } from "@/components/ui/Table";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import { deriveOwners, filterByOwners } from "@/lib/leadFilters";
import type { AccountListItem } from "@/lib/types";

type View = "all" | "active" | "at_risk" | "churned" | "archived";

interface AccountsResponse {
  accounts: AccountListItem[];
  tabCounts: Record<Exclude<View, "all">, number> & { all: number };
}

const VIEWS: { value: View; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "at_risk", label: "At risk" },
  { value: "churned", label: "Churned" },
  { value: "archived", label: "Archived" },
];

const EMPTY: Record<View, { title: string; description: string }> = {
  all: { title: "No accounts yet", description: "Convert a won lead, or create an account directly." },
  active: { title: "No active accounts", description: "Accounts in good standing show up here." },
  at_risk: { title: "No accounts at risk", description: "Accounts flagged as at risk show up here." },
  churned: { title: "No churned accounts", description: "Accounts that have churned are listed here." },
  archived: { title: "Nothing archived", description: "Accounts you archive show up here and can be restored." },
};

export default function AccountsPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const me = useSession();
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);

  const archived = view === "archived";
  const params = new URLSearchParams();
  if (archived) params.set("archived", "1");
  else if (view !== "all") params.set("status", view);
  if (q.trim()) params.set("q", q.trim());
  const qs = params.toString();
  const { data, error, refresh } = useApi<AccountsResponse>(`/api/accounts${qs ? `?${qs}` : ""}`);

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const owners = useMemo(() => deriveOwners(accounts), [accounts]);
  const visible = useMemo(() => filterByOwners(accounts, ownerIds), [accounts, ownerIds]);

  const { sort, toggle } = useSort();
  const sorted = useMemo(() => sortRows(visible, sort, ACCOUNT_SORT), [visible, sort]);
  const { page, setPage, pageCount, pageRows, total, pageSize } = usePagination(sorted, 25);
  useEffect(() => setPage(1), [sort, q, view, ownerIds, setPage]);

  // Drop selections that disappeared after a refresh, search or filter.
  useEffect(() => {
    setSelected((prev) => {
      const live = new Set(visible.map((a) => a.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visible]);

  const selection = {
    ids: selected,
    toggle: (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    set: (ids: string[], on: boolean) =>
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (on) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
  };

  async function restore(a: AccountListItem) {
    setRestoringId(a.id);
    try {
      await api.patch(`/api/accounts/${a.id}`, { action: "restore" });
      toast(`${a.name} restored.`, "success");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not restore", "error");
    } finally {
      setRestoringId(null);
    }
  }

  async function bulkArchive() {
    const ids = [...selected];
    const noun = ids.length === 1 ? "account" : "accounts";
    const ok = await confirm({
      title: `Archive ${ids.length} ${noun}?`,
      description: "They leave the active lists. Restore them any time from Archived.",
      confirmLabel: "Archive",
      tone: "danger",
    });
    if (!ok) return;
    setArchiving(true);
    // allSettled: one failure must not strand the rest, some may already be archived server-side.
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/api/accounts/${id}`)));
    const failed = results.filter((r) => r.status === "rejected").length;
    const done = ids.length - failed;
    if (done > 0) toast(`${done} ${done === 1 ? "account" : "accounts"} archived.`, "success");
    if (failed > 0) toast(`${failed} could not be archived. Try again.`, "error");
    setSelected(new Set());
    setArchiving(false);
    refresh();
  }

  const filtering = Boolean(q.trim() || ownerIds.length);
  const counts = data?.tabCounts;

  return (
    <Page>
      <PageHeader
        title="Accounts"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" strokeWidth={1.5} aria-hidden /> New account
          </Button>
        }
      />

      <Summary rows={data ? visible : null} archived={archived} />

      <Panel aria-label="Accounts ledger">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="max-w-full overflow-x-auto">
            <SegmentedControl
              aria-label="Show"
              value={view}
              onChange={(v) => {
                setView(v);
                setSelected(new Set());
              }}
              options={VIEWS.map((v) => ({
                value: v.value,
                label: (
                  <>
                    {v.label}
                    {counts && <span className="tnum font-normal text-ink-3">{counts[v.value]}</span>}
                  </>
                ),
              }))}
            />
          </div>
          <div className="relative min-w-40 flex-1 sm:max-w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" strokeWidth={1.5} aria-hidden />
            <Input type="search" aria-label="Filter accounts by name" placeholder="Filter by name" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          {(owners.length > 1 || ownerIds.length > 0) && <OwnerFilter owners={owners} value={ownerIds} onChange={setOwnerIds} currentUserId={me.id} />}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !data ? (
          <RowsSkeleton rows={6} label="Loading accounts" />
        ) : visible.length === 0 ? (
          filtering ? (
            <EmptyState
              icon={<Building2 className="size-6" strokeWidth={1.5} />}
              title="No matching accounts"
              description="Try a different name or owner."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setQ("");
                    setOwnerIds([]);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Building2 className="size-6" strokeWidth={1.5} />}
              title={EMPTY[view].title}
              description={EMPTY[view].description}
              action={
                view === "all" && (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <Plus className="size-4" strokeWidth={1.5} aria-hidden /> New account
                  </Button>
                )
              }
            />
          )
        ) : (
          <>
            <AccountsTable
              rows={pageRows}
              all={sorted}
              archived={archived}
              sort={sort}
              onSort={toggle}
              selection={selection}
              restoringId={restoringId}
              onRestore={restore}
            />
            <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} />
          </>
        )}
      </Panel>

      {!archived && selected.size > 0 && (
        <Portal>
          <div
            role="region"
            aria-label="Bulk actions"
            className="glass-pop fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-fit items-center gap-3 rounded-full py-2 pl-4 pr-2 md:bottom-6"
          >
            <span className="tnum font-medium text-ink-1">{selected.size} selected</span>
            <Button size="sm" variant="danger" loading={archiving} onClick={bulkArchive}>
              <Archive className="size-3.5" strokeWidth={1.5} aria-hidden /> Archive
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="size-3.5" strokeWidth={1.5} aria-hidden /> Clear
            </Button>
          </div>
        </Portal>
      )}

      {creating && <NewAccountModal onClose={() => setCreating(false)} onCreated={() => refresh()} />}
    </Page>
  );
}

/** One line over the ledger: how many accounts, their monthly value, and where the money stands. */
function Summary({ rows, archived }: { rows: AccountListItem[] | null; archived: boolean }) {
  if (!rows) {
    return (
      <Panel aria-label="Summary">
        <Skeleton className="h-5 w-3/4" />
      </Panel>
    );
  }
  const sum = (pick: (a: AccountListItem) => number) => rows.reduce((s, a) => s + pick(a), 0);
  const overdue = sum((a) => a.finance.overdue);
  const overdueCount = rows.filter((a) => a.finance.overdue > 0).length;
  const fig = "font-medium text-ink-1";
  return (
    <Panel aria-label="Summary">
      <p className="text-[15px] text-ink-2">
        <span className={fig}>
          <span className="tnum">{rows.length}</span> {archived ? "archived " : ""}
          {rows.length === 1 ? "account" : "accounts"}
        </span>
        {" worth "}
        <Money value={sum((a) => a.value)} compact className={fig} /> a month · <Money value={sum((a) => a.finance.billed)} compact className={fig} />{" "}
        billed · <Money value={sum((a) => a.finance.outstanding)} compact className={fig} /> outstanding
        {overdue > 0 && (
          <>
            {", "}
            <span className="font-medium text-overdue">
              <Money value={overdue} compact /> overdue
            </span>{" "}
            across <span className="tnum">{overdueCount}</span> {overdueCount === 1 ? "account" : "accounts"}
          </>
        )}
      </p>
    </Panel>
  );
}
