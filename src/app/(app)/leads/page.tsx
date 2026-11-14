"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Ban, Kanban, Plus, Rows3, X } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { PageHeader } from "@/components/layout/PageHeader";
import { useSession } from "@/components/layout/SessionContext";
import { useDataChanged } from "@/components/layout/ShellContext";
import { AddLeadDrawer } from "@/components/leads/AddLeadDrawer";
import { ArchivedLeads } from "@/components/leads/ArchivedLeads";
import { LeadBoard } from "@/components/leads/LeadBoard";
import { LeadTable } from "@/components/leads/LeadTable";
import { OwnerFilter } from "@/components/ui/OwnerFilter";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, PageLoader, Skeleton } from "@/components/ui/Misc";
import { formatMoney } from "@/components/ui/Money";
import { Panel } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useApi } from "@/lib/client";
import { DEFAULT_LEAD_CATEGORIES, PIPELINE_STAGES, STAGE_META, formatCategoryLabel, type BoardStage, type LeadStage } from "@/lib/constants";
import {
  deriveOwners,
  filterByOwners,
  parseOwnerParam,
  parseStageParam,
  serializeOwnerParam,
  summarizeLeads,
} from "@/lib/leadFilters";
import { plural } from "@/lib/utils";
import type { LeadDTO } from "@/lib/types";

type View = "board" | "table" | "lost" | "archived";

/** Placeholder lanes while the board loads. */
function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(5,minmax(240px,1fr))] md:overflow-hidden" aria-busy="true" aria-label="Loading leads">
      {PIPELINE_STAGES.map((s, i) => (
        <div key={s} className={i > 0 ? "glass-lane rounded-panel p-4 max-md:hidden" : "glass-lane rounded-panel p-4"}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mb-4 mt-3 h-[3px] w-full" />
          {[0, 1, 2].map((c) => (
            <Skeleton key={c} className="mb-2 h-[74px] w-full rounded-card" />
          ))}
        </div>
      ))}
    </div>
  );
}

function LeadsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const me = useSession();
  const initialStage = parseStageParam(params.get("stage"));
  const [view, setView] = useState<View>(initialStage === "lost" ? "lost" : "board");
  // `?stage=` focuses a lane on the board and filters the table. Lost has its own view.
  const [stage, setStage] = useState<LeadStage | null>(initialStage === "lost" ? null : initialStage);
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [category, setCategory] = useState(() => params.get("category") ?? "");
  // Owner filter is shareable: seeded from and written back to `?owner=`.
  const [ownerIds, setOwnerIds] = useState<string[]>(() => parseOwnerParam(params.get("owner")));
  const [adding, setAdding] = useState(false);
  const [presetStage, setPresetStage] = useState<BoardStage | undefined>();

  const categoriesApi = useApi<{ categories: string[] }>("/api/workspace/categories");
  const categoryOptions = categoriesApi.data?.categories ?? [];

  // Search and category filter on the server; the owner filter stays client-side
  // so the owner list can be derived from the full result set.
  const apiQs = new URLSearchParams();
  if (q.trim()) apiQs.set("q", q.trim());
  if (category.trim()) apiQs.set("category", category.trim());
  const url = `/api/leads${apiQs.size ? `?${apiQs.toString()}` : ""}`;
  const { data, loading, error, refresh } = useApi<{ leads: LeadDTO[] }>(url);
  // Every mutation made through `api` (board moves, table archives, restores, the
  // add drawer) reloads the leads here, once. Children take no refresh callback.
  useDataChanged(refresh);
  const leads = useMemo(() => data?.leads ?? [], [data]);

  // Archived leads come from a separate query, fetched only while that view is open
  // and not subscribed to changes, so a restore reloads it explicitly.
  const archivedApi = useApi<{ leads: LeadDTO[] }>(view === "archived" ? "/api/leads?archived=1" : null);

  const owners = useMemo(() => deriveOwners(leads), [leads]);

  // Mirror the filters into the URL so a filtered board is shareable. Built from live
  // state and guarded so a clean visit issues no navigation; `replace` keeps history clean.
  useEffect(() => {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (ownerIds.length) next.set("owner", serializeOwnerParam(ownerIds));
    if (category.trim()) next.set("category", category.trim());
    // The Lost view is itself a stage link (`?stage=lost`), so it stays shareable.
    if (view === "lost") next.set("stage", "lost");
    else if (stage) next.set("stage", stage);
    const qs = next.toString();
    if (qs !== params.toString()) router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [q, ownerIds, category, stage, view, params, pathname, router]);

  const visibleLeads = useMemo(() => filterByOwners(leads, ownerIds), [leads, ownerIds]);
  const visibleArchived = useMemo(() => filterByOwners(archivedApi.data?.leads ?? [], ownerIds), [archivedApi.data, ownerIds]);
  const summary = useMemo(() => summarizeLeads(visibleLeads), [visibleLeads]);
  const boardLeads = useMemo(() => visibleLeads.filter((l) => l.stage !== "lost"), [visibleLeads]);
  const lostLeads = useMemo(() => visibleLeads.filter((l) => l.stage === "lost"), [visibleLeads]);
  const tableLeads = useMemo(() => (stage ? boardLeads.filter((l) => l.stage === stage) : boardLeads), [boardLeads, stage]);

  const filtering = q.trim().length > 0 || ownerIds.length > 0 || category.trim().length > 0;
  // Show the owner control when there is a choice to make, or a (possibly stale,
  // deep-linked) selection that needs a visible way to clear.
  const showOwnerFilter = owners.length > 1 || ownerIds.length > 0;
  const clearFilters = () => {
    setQ("");
    setOwnerIds([]);
    setCategory("");
  };

  function openAdd(preset?: BoardStage) {
    setPresetStage(preset);
    setAdding(true);
  }

  const categorySelectOptions =
    category && !categoryOptions.includes(category)
      ? [...categoryOptions, category]
      : categoryOptions.length
        ? categoryOptions
        : [...DEFAULT_LEAD_CATEGORIES];

  const clearFiltersButton = (
    <Button onClick={clearFilters}>
      <X className="size-4" strokeWidth={1.5} aria-hidden /> Clear filters
    </Button>
  );
  const noMatch = "Try a different search, owner or category.";

  function content() {
    if (error) return <ErrorState message={error} onRetry={refresh} />;

    if (view === "archived") {
      if (archivedApi.loading) return <PageLoader label="Loading archived leads…" />;
      return (
        <Panel title="Archived" meta={visibleArchived.length || undefined}>
          {visibleArchived.length > 0 ? (
            <ArchivedLeads leads={visibleArchived} onChanged={archivedApi.refresh} />
          ) : (
            <EmptyState
              icon={<Archive className="size-6" strokeWidth={1.5} aria-hidden />}
              title={filtering ? "No archived leads match those filters" : "Nothing archived"}
              description={filtering ? noMatch : "Leads you archive show up here and can be restored."}
              action={filtering && clearFiltersButton}
            />
          )}
        </Panel>
      );
    }

    if (loading && !data) return <BoardSkeleton />;

    if (view === "lost") {
      return (
        <Panel title="Lost" meta={lostLeads.length || undefined}>
          {lostLeads.length > 0 ? (
            <LeadTable key="lost" variant="lost" leads={lostLeads} />
          ) : (
            <EmptyState
              icon={<Ban className="size-6" strokeWidth={1.5} aria-hidden />}
              title={filtering ? "No lost leads match those filters" : "No lost leads"}
              description={filtering ? noMatch : "Leads you mark as lost are kept here with their reason."}
              action={filtering && clearFiltersButton}
            />
          )}
        </Panel>
      );
    }

    if (boardLeads.length === 0) {
      return (
        <Panel>
          <EmptyState
            icon={<Kanban className="size-6" strokeWidth={1.5} aria-hidden />}
            title={filtering ? "No leads match those filters" : "No leads yet"}
            description={filtering ? noMatch : "Add your first lead and start working the pipeline."}
            action={
              filtering ? (
                clearFiltersButton
              ) : (
                <Button variant="primary" onClick={() => openAdd()}>
                  <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Add a lead
                </Button>
              )
            }
          />
        </Panel>
      );
    }

    if (view === "board") {
      return (
        <LeadBoard
          leads={boardLeads}
          lostCount={summary.lost}
          focusStage={stage}
          onAdd={openAdd}
          onShowLost={() => setView("lost")}
        />
      );
    }

    return (
      <Panel title={stage ? STAGE_META[stage].label : "All leads"} meta={tableLeads.length}>
        {tableLeads.length > 0 ? (
          <LeadTable key="active" leads={tableLeads} />
        ) : (
          <EmptyState title={`Nothing in ${STAGE_META[stage ?? "new"].label.toLowerCase()}`} description="Clear the stage filter to see every lead." />
        )}
      </Panel>
    );
  }

  return (
    <Page>
      <PageHeader title="Leads" />

      <Panel aria-label="Pipeline summary" className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="tnum min-w-0 flex-[1_1_360px] text-[17px] leading-[1.3] text-ink-2 md:text-[20px]">
          {loading && !data ? (
            <Skeleton className="h-6 w-80 max-w-full" />
          ) : (
            <>
              {summary.open > 0 ? (
                <>
                  <span className="font-medium text-ink-1">{plural(summary.open, "open lead")}</span>
                  {summary.openValue > 0 && (
                    <>
                      {" "}worth <span className="font-medium text-ink-1">{formatMoney(summary.openValue, true)}</span>
                    </>
                  )}
                  .
                </>
              ) : (
                <span className="font-medium text-ink-1">No open leads.</span>
              )}{" "}
              <span className="font-medium text-paid">{summary.won} won</span>, {summary.parked} parked.
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {stage && (
            <span className="inline-flex h-[34px] items-center gap-1.5 rounded-control bg-sunk pl-2.5 pr-1 text-[13px]">
              <span className="text-ink-3">Stage</span> {STAGE_META[stage].label}
              <button type="button" onClick={() => setStage(null)} aria-label="Clear stage filter" className="grid size-7 place-items-center rounded-[8px] text-ink-2 hover:bg-hover hover:text-ink-1">
                <X className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
            </span>
          )}
          {showOwnerFilter && <OwnerFilter owners={owners} value={ownerIds} onChange={setOwnerIds} currentUserId={me.id} />}
          <Select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto max-w-44 text-[13px]">
            <option value="">All categories</option>
            {categorySelectOptions.map((c) => (
              <option key={c} value={c}>
                {formatCategoryLabel(c)}
              </option>
            ))}
          </Select>
          <Input type="search" aria-label="Filter leads" placeholder="Filter leads" value={q} onChange={(e) => setQ(e.target.value)} className="w-44 text-[13px] max-md:flex-1" />
          <SegmentedControl<View>
            aria-label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "board", label: "Board", icon: Kanban },
              { value: "table", label: "Table", icon: Rows3 },
              {
                value: "lost",
                label: (
                  <>
                    Lost <span className="tnum text-ink-3">{summary.lost}</span>
                  </>
                ),
              },
              { value: "archived", label: "Archived" },
            ]}
          />
        </div>
      </Panel>

      {content()}

      <AddLeadDrawer
        key={presetStage ?? "any"}
        open={adding}
        onClose={() => setAdding(false)}
        defaultStage={presetStage}
      />
    </Page>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LeadsInner />
    </Suspense>
  );
}
