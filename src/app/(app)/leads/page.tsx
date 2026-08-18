"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Rows3, Search, Plus, Ban, Archive, RotateCcw, X } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { useSession } from "@/components/layout/SessionContext";
import { LeadBoard } from "@/components/leads/LeadBoard";
import { LeadTable } from "@/components/leads/LeadTable";
import { OwnerFilter } from "@/components/leads/OwnerFilter";
import { AddLeadDrawer } from "@/components/leads/AddLeadDrawer";
import { CategoryBadge } from "@/components/leads/CategoryBadge";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PageLoader, ErrorState, EmptyState } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import { STAGE_META, formatCategoryLabel, DEFAULT_LEAD_CATEGORIES, isActiveLeadStage } from "@/lib/constants";
import { cn, formatINRCompact } from "@/lib/utils";
import { deriveOwners, filterLeadsByOwners, parseOwnerParam, serializeOwnerParam } from "@/lib/leadFilters";
import type { LeadDTO } from "@/lib/types";
import type { BoardStage } from "@/lib/constants";

function LeadsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const me = useSession();
  const initialQ = params.get("q") ?? "";
  const [view, setView] = useState<"board" | "table" | "lost" | "archived">("board");
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState(() => params.get("category") ?? "");
  // Selected owner ids to filter by — Jira-style board filter, seeded from the URL so it's shareable.
  const [ownerIds, setOwnerIds] = useState<string[]>(() => parseOwnerParam(params.get("owner")));
  const [adding, setAdding] = useState(false);
  const [presetStage, setPresetStage] = useState<BoardStage | undefined>();

  const categoriesApi = useApi<{ categories: string[] }>("/api/workspace/categories");
  const categoryOptions = categoriesApi.data?.categories ?? [];

  // Server-side filters: search + category. Owner filter stays client-side (see below).
  const apiQs = new URLSearchParams();
  if (q.trim()) apiQs.set("q", q.trim());
  if (category.trim()) apiQs.set("category", category.trim());
  const url = `/api/leads${apiQs.size ? `?${apiQs.toString()}` : ""}`;
  const { data, loading, error, refresh } = useApi<{ leads: LeadDTO[] }>(url);
  const leads = data?.leads ?? [];

  // Archived leads come from a separate query, fetched only when that view is open.
  const archivedApi = useApi<{ leads: LeadDTO[] }>(view === "archived" ? "/api/leads?archived=1" : null);
  const archivedLeads = archivedApi.data?.leads ?? [];

  // Everyone who owns a lead in the current result set, with their lead counts — the
  // pool of people you can filter by (derived from the board, like Jira's avatar row).
  const owners = useMemo(() => deriveOwners(leads), [leads]);

  // Reflect search, owner, and category filters in the URL so a filtered board is
  // shareable/bookmarkable. Built from live state (not stale params) and guarded so
  // a clean visit issues no redundant navigation. `replace` keeps history clean.
  useEffect(() => {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (ownerIds.length) next.set("owner", serializeOwnerParam(ownerIds));
    if (category.trim()) next.set("category", category.trim());
    const qs = next.toString();
    if (qs !== params.toString()) router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [q, ownerIds, category, params, pathname, router]);

  // Owner filter applies to whichever list a view renders (active/lost here, archived below).
  const visibleLeads = useMemo(() => filterLeadsByOwners(leads, ownerIds), [leads, ownerIds]);
  const visibleArchived = useMemo(() => filterLeadsByOwners(archivedLeads, ownerIds), [archivedLeads, ownerIds]);

  // Lost leads live in their own view. Parked leads stay on the board in a holding lane
  // (excluded from Active / pipeline stats) so they can be collapsed out of the way.
  const { activeLeads, lostLeads } = useMemo(() => {
    const lost: LeadDTO[] = [];
    const active: LeadDTO[] = [];
    for (const l of visibleLeads) (l.stage === "lost" ? lost : active).push(l);
    return { activeLeads: active, lostLeads: lost };
  }, [visibleLeads]);

  const shownLeads = view === "lost" ? lostLeads : activeLeads;
  const filtering = q.trim().length > 0 || ownerIds.length > 0 || category.trim().length > 0;
  // Show the control whenever there's more than one owner to choose from, OR a filter is
  // already active — so a stale/deep-linked selection always has a visible way to clear.
  const showOwnerFilter = owners.length > 1 || ownerIds.length > 0;
  const clearFilters = () => {
    setQ("");
    setOwnerIds([]);
    setCategory("");
  };

  function openAdd(stage?: BoardStage) {
    setPresetStage(stage);
    setAdding(true);
  }

  const categorySelectOptions =
    category && !categoryOptions.includes(category)
      ? [...categoryOptions, category]
      : categoryOptions.length
        ? categoryOptions
        : [...DEFAULT_LEAD_CATEGORIES];

  return (
    <>
      <PageHeader>
        <h1 className="font-display text-[22px] font-bold tracking-tight text-ink">Leads</h1>

        <div className="ml-1 flex items-center gap-1 rounded-full border border-line/50 bg-canvas/60 p-1 backdrop-blur-md shadow-inner dark:border-line-strong dark:bg-canvas/30">
          {([
            ["board", LayoutGrid, "Board"],
            ["table", Rows3, "Table"],
            ["lost", Ban, "Lost"],
            ["archived", Archive, "Archived"],
          ] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "relative inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition-all duration-200",
                view === v
                  ? v === "lost"
                    ? "bg-danger text-white shadow-md shadow-danger/20"
                    : "bg-paper text-ink shadow-sm ring-1 ring-line/50 dark:bg-violet-600 dark:text-white dark:ring-violet-500"
                  : "text-muted hover:text-ink dark:hover:text-ink-soft",
              )}
            >
              <Icon className="size-4" /> {label}
              {v === "lost" && lostLeads.length > 0 && (
                <span className="tnum text-[11px] font-bold opacity-70">{lostLeads.length}</span>
              )}
            </button>
          ))}
        </div>

        {showOwnerFilter && (
          <div className="ml-auto">
            <OwnerFilter owners={owners} value={ownerIds} onChange={setOwnerIds} currentUserId={me.id} />
          </div>
        )}

        <div className={cn("relative hidden max-w-xs flex-1 sm:block", showOwnerFilter ? "" : "ml-auto")}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search leads... (Cmd+K)"
            className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-canvas/60 pl-9 pr-3 text-[13.5px] text-ink placeholder:text-faint transition-colors focus:border-violet-400 focus:bg-paper focus:outline-none focus:ring-4 focus:ring-violet-100 dark:bg-canvas/40"
          />
        </div>

        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="hidden h-9 rounded-[var(--radius-md)] border border-line bg-canvas/60 px-2.5 text-[13px] font-medium text-ink sm:block dark:bg-canvas/40"
        >
          <option value="">All categories</option>
          {categorySelectOptions.map((c) => (
            <option key={c} value={c}>
              {formatCategoryLabel(c)}
            </option>
          ))}
        </select>

        <Button variant="primary" onClick={() => openAdd()} className="ml-auto sm:ml-0 shadow-sm shadow-violet-500/20">
          <Plus className="size-4" /> New lead
        </Button>
      </PageHeader>

      {category && (
        <div className="flex items-center gap-2 px-6 pt-3 lg:px-8">
          <span className="text-[12.5px] text-muted">Showing</span>
          <CategoryBadge category={category} />
          <button
            type="button"
            onClick={() => setCategory("")}
            className="text-[12.5px] font-semibold text-violet-700 hover:underline"
          >
            Clear category
          </button>
        </div>
      )}

      {/* Insights Summary Bar */}
      <div className="px-6 lg:px-8 mt-5">
        <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] border border-line bg-paper p-4 shadow-[var(--shadow-card)] dark:border-white/10">
          <div className="flex-1 min-w-[150px]">
            <p className="text-[12px] font-semibold tracking-wide uppercase text-muted mb-0.5">Total Pipeline</p>
            <p className="font-display text-2xl font-bold tracking-tight text-ink">
              {formatINRCompact(activeLeads.filter((l) => isActiveLeadStage(l.stage)).reduce((acc, l) => acc + l.estValue, 0))}
            </p>
          </div>
          <div className="h-10 w-px bg-line hidden sm:block"></div>
          <div className="flex-1 min-w-[120px]">
            <p className="text-[12px] font-semibold tracking-wide uppercase text-muted mb-0.5">Active Leads</p>
            <p className="font-display text-2xl font-bold tracking-tight text-ink">{activeLeads.filter((l) => isActiveLeadStage(l.stage)).length}</p>
          </div>
          <div className="h-10 w-px bg-line hidden sm:block"></div>
          <div className="flex-1 min-w-[120px]">
            <p className="text-[12px] font-semibold tracking-wide uppercase text-muted mb-0.5">Won (Active)</p>
            <p className="font-display text-2xl font-bold tracking-tight text-success">
              {activeLeads.filter((l) => l.stage === "won").length}
            </p>
          </div>
          {activeLeads.some((l) => l.stage === "parked") && (
            <>
              <div className="h-10 w-px bg-line hidden sm:block"></div>
              <div className="flex-1 min-w-[120px]">
                <p className="text-[12px] font-semibold tracking-wide uppercase text-muted mb-0.5">Parked</p>
                <p className="font-display text-2xl font-bold tracking-tight text-ink-soft">
                  {activeLeads.filter((l) => l.stage === "parked").length}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="pt-5">
        {error ? (
          <div className="px-6 lg:px-8">
            <ErrorState message={error} onRetry={refresh} />
          </div>
        ) : view === "archived" ? (
          archivedApi.loading ? (
            <PageLoader label="Loading archived leads…" />
          ) : (
            <ArchivedLeads leads={visibleArchived} filtering={filtering} onClearFilters={clearFilters} onChanged={archivedApi.refresh} />
          )
        ) : loading ? (
          <PageLoader label="Loading your pipeline…" />
        ) : view === "lost" ? (
          lostLeads.length === 0 ? (
            <div className="px-6 lg:px-8">
              <EmptyState
                icon={<Ban className="size-6" />}
                title={filtering ? "No lost leads match those filters" : "No lost leads"}
                description={filtering ? "Try adjusting your search, owner, or category filter." : "Leads you mark as lost will be archived here."}
                action={filtering && <Button variant="secondary" onClick={clearFilters}><X className="size-4" /> Clear filters</Button>}
              />
            </div>
          ) : (
            <LeadTable key="lost" leads={lostLeads} onChanged={refresh} />
          )
        ) : shownLeads.length === 0 ? (
          <div className="px-6 lg:px-8">
            <EmptyState
              icon={<LayoutGrid className="size-6" />}
              title={filtering ? "No leads match those filters" : "No leads yet"}
              description={filtering ? "Try adjusting your search, owner, or category filter." : "Add your first lead and start working the pipeline."}
              action={
                filtering ? (
                  <Button variant="secondary" onClick={clearFilters}><X className="size-4" /> Clear filters</Button>
                ) : (
                  <Button variant="primary" onClick={() => openAdd()}><Plus className="size-4" /> New lead</Button>
                )
              }
            />
          </div>
        ) : view === "board" ? (
          <LeadBoard leads={activeLeads} onAdd={openAdd} onChanged={refresh} />
        ) : (
          <LeadTable key="active" leads={activeLeads} onChanged={refresh} />
        )}
      </div>

      <AddLeadDrawer open={adding} onClose={() => setAdding(false)} onCreated={() => refresh()} defaultStage={presetStage} key={presetStage ?? "any"} />
    </>
  );
}

function ArchivedLeads({
  leads,
  filtering,
  onClearFilters,
  onChanged,
}: {
  leads: LeadDTO[];
  filtering: boolean;
  onClearFilters: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function restore(lead: LeadDTO) {
    setBusyId(lead.id);
    try {
      await api.patch(`/api/leads/${lead.id}`, { action: "restore" });
      toast(`${lead.name} restored.`, "success");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not restore", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (leads.length === 0) {
    return (
      <div className="px-6 lg:px-8">
        <EmptyState
          icon={<Archive className="size-6" />}
          title={filtering ? "No archived leads match those filters" : "Nothing archived"}
          description={filtering ? "Try adjusting your search, owner, or category filter." : "Leads you archive will show up here and can be restored."}
          action={filtering && <Button variant="secondary" onClick={onClearFilters}><X className="size-4" /> Clear filters</Button>}
        />
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 sm:px-6 lg:px-8">
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Lead</th>
                <th className="px-5 py-3">Company</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Stage</th>
                <th className="px-5 py-3">Owner</th>
                <th className="px-5 py-3 text-right">Est. value</th>
                <th className="px-5 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {leads.map((l) => {
                const meta = STAGE_META[l.stage];
                return (
                  <tr key={l.id}>
                    <td className="px-5 py-3.5 text-[13.5px] font-semibold text-ink">{l.name}</td>
                    <td className="px-5 py-3.5 text-[13px] text-muted">{l.company || "—"}</td>
                    <td className="px-5 py-3.5"><CategoryBadge category={l.category} /></td>
                    <td className="px-5 py-3.5"><Badge tint={meta.tint} dot={meta.dot}>{meta.label}</Badge></td>
                    <td className="px-5 py-3.5">
                      {l.ownerName ? (
                        <span className="inline-flex items-center gap-2 text-[13px] text-ink-soft"><Avatar name={l.ownerName} size={22} /> {l.ownerName}</span>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-[13px] text-ink-soft tnum">{l.estValue > 0 ? formatINRCompact(l.estValue) : "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Button size="sm" variant="secondary" loading={busyId === l.id} onClick={() => restore(l)}>
                        <RotateCcw className="size-3.5" /> Restore
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LeadsInner />
    </Suspense>
  );
}
