"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Rows3, Search, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { LeadBoard } from "@/components/leads/LeadBoard";
import { LeadTable } from "@/components/leads/LeadTable";
import { AddLeadDrawer } from "@/components/leads/AddLeadDrawer";
import { Button } from "@/components/ui/Button";
import { PageLoader, ErrorState, EmptyState } from "@/components/ui/Misc";
import { useApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { LeadDTO } from "@/lib/types";
import type { PipelineStage } from "@/lib/constants";

function LeadsInner() {
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState(initialQ);
  const [adding, setAdding] = useState(false);
  const [presetStage, setPresetStage] = useState<PipelineStage | undefined>();

  const url = `/api/leads${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`;
  const { data, loading, error, refresh } = useApi<{ leads: LeadDTO[] }>(url);
  const leads = data?.leads ?? [];

  function openAdd(stage?: PipelineStage) {
    setPresetStage(stage);
    setAdding(true);
  }

  return (
    <>
      <PageHeader>
        <h1 className="font-display text-[22px] font-bold tracking-tight text-ink">Leads</h1>

        <div className="ml-1 flex items-center gap-1 rounded-[var(--radius-md)] border border-line bg-paper p-1">
          {([
            ["board", LayoutGrid, "Board"],
            ["table", Rows3, "Table"],
          ] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-[12.5px] font-semibold transition-all",
                view === v ? "bg-violet-50 text-violet-700" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto hidden max-w-xs flex-1 sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter leads"
            className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-paper pl-9 pr-3 text-[13.5px] text-ink placeholder:text-faint focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-100"
          />
        </div>

        <Button variant="primary" onClick={() => openAdd()} className="ml-auto sm:ml-0">
          <Plus className="size-4" /> New lead
        </Button>
      </PageHeader>

      <div className="pt-5">
        {error ? (
          <div className="px-6 lg:px-8">
            <ErrorState message={error} onRetry={refresh} />
          </div>
        ) : loading ? (
          <PageLoader label="Loading your pipeline…" />
        ) : leads.length === 0 ? (
          <div className="px-6 lg:px-8">
            <EmptyState
              icon={<LayoutGrid className="size-6" />}
              title={q ? "No leads match that filter" : "No leads yet"}
              description={q ? "Try a different search." : "Add your first lead and start working the pipeline."}
              action={!q && <Button variant="primary" onClick={() => openAdd()}><Plus className="size-4" /> New lead</Button>}
            />
          </div>
        ) : view === "board" ? (
          <LeadBoard leads={leads} onAdd={openAdd} onChanged={refresh} />
        ) : (
          <LeadTable leads={leads} />
        )}
      </div>

      <AddLeadDrawer open={adding} onClose={() => setAdding(false)} onCreated={() => refresh()} defaultStage={presetStage} key={presetStage ?? "any"} />
    </>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LeadsInner />
    </Suspense>
  );
}
