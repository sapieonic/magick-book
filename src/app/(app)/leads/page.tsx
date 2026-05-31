"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Rows3, Search, Plus, Ban, Archive, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { LeadBoard } from "@/components/leads/LeadBoard";
import { LeadTable } from "@/components/leads/LeadTable";
import { AddLeadDrawer } from "@/components/leads/AddLeadDrawer";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PageLoader, ErrorState, EmptyState } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import { STAGE_META } from "@/lib/constants";
import { cn, formatINRCompact } from "@/lib/utils";
import type { LeadDTO } from "@/lib/types";
import type { PipelineStage } from "@/lib/constants";

function LeadsInner() {
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [view, setView] = useState<"board" | "table" | "lost" | "archived">("board");
  const [q, setQ] = useState(initialQ);
  const [adding, setAdding] = useState(false);
  const [presetStage, setPresetStage] = useState<PipelineStage | undefined>();

  const url = `/api/leads${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`;
  const { data, loading, error, refresh } = useApi<{ leads: LeadDTO[] }>(url);
  const leads = data?.leads ?? [];

  // Archived leads come from a separate query, fetched only when that view is open.
  const archivedApi = useApi<{ leads: LeadDTO[] }>(view === "archived" ? "/api/leads?archived=1" : null);
  const archivedLeads = archivedApi.data?.leads ?? [];

  // Lost leads live in their own view; the pipeline views (board/table) stay focused on active leads.
  const { activeLeads, lostLeads } = useMemo(() => {
    const lost: LeadDTO[] = [];
    const active: LeadDTO[] = [];
    for (const l of leads) (l.stage === "lost" ? lost : active).push(l);
    return { activeLeads: active, lostLeads: lost };
  }, [leads]);

  const shownLeads = view === "lost" ? lostLeads : activeLeads;

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
            ["lost", Ban, "Lost"],
            ["archived", Archive, "Archived"],
          ] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-[12.5px] font-semibold transition-all",
                view === v
                  ? v === "lost"
                    ? "bg-danger-bg text-danger"
                    : "bg-violet-50 text-violet-700"
                  : "text-muted hover:text-ink",
              )}
            >
              <Icon className="size-4" /> {label}
              {v === "lost" && lostLeads.length > 0 && (
                <span className="tnum text-[11px] font-bold opacity-70">{lostLeads.length}</span>
              )}
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
        ) : view === "archived" ? (
          archivedApi.loading ? (
            <PageLoader label="Loading archived leads…" />
          ) : (
            <ArchivedLeads leads={archivedLeads} onChanged={archivedApi.refresh} />
          )
        ) : loading ? (
          <PageLoader label="Loading your pipeline…" />
        ) : view === "lost" ? (
          lostLeads.length === 0 ? (
            <div className="px-6 lg:px-8">
              <EmptyState
                icon={<Ban className="size-6" />}
                title={q ? "No lost leads match that filter" : "No lost leads"}
                description={q ? "Try a different search." : "Leads you mark as lost will be archived here."}
              />
            </div>
          ) : (
            <LeadTable leads={lostLeads} />
          )
        ) : shownLeads.length === 0 ? (
          <div className="px-6 lg:px-8">
            <EmptyState
              icon={<LayoutGrid className="size-6" />}
              title={q ? "No leads match that filter" : "No leads yet"}
              description={q ? "Try a different search." : "Add your first lead and start working the pipeline."}
              action={!q && <Button variant="primary" onClick={() => openAdd()}><Plus className="size-4" /> New lead</Button>}
            />
          </div>
        ) : view === "board" ? (
          <LeadBoard leads={activeLeads} onAdd={openAdd} onChanged={refresh} />
        ) : (
          <LeadTable leads={activeLeads} />
        )}
      </div>

      <AddLeadDrawer open={adding} onClose={() => setAdding(false)} onCreated={() => refresh()} defaultStage={presetStage} key={presetStage ?? "any"} />
    </>
  );
}

function ArchivedLeads({ leads, onChanged }: { leads: LeadDTO[]; onChanged: () => void }) {
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
        <EmptyState icon={<Archive className="size-6" />} title="Nothing archived" description="Leads you archive will show up here and can be restored." />
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
