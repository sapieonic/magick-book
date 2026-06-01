"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Time } from "@/components/ui/Time";
import { SortHeader, useSort, sortRows, usePagination, Pagination } from "@/components/ui/Table";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { STAGE_META, PIPELINE_STAGES } from "@/lib/constants";
import { formatINRCompact } from "@/lib/utils";
import type { LeadDTO } from "@/lib/types";

export function LeadTable({ leads, onChanged }: { leads: LeadDTO[]; onChanged?: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { sort, toggle } = useSort("activity", "desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);

  const sorted = useMemo(
    () =>
      sortRows(leads, sort, {
        name: (l) => l.name,
        company: (l) => l.company,
        // Sort stages along the pipeline (New → Won), not alphabetically by label.
        stage: (l) => (PIPELINE_STAGES as readonly string[]).indexOf(l.stage),
        owner: (l) => l.ownerName,
        estValue: (l) => l.estValue,
        activity: (l) => {
          const t = Date.parse(l.lastActivityAt);
          return Number.isNaN(t) ? null : t;
        },
      }),
    [leads, sort.key, sort.dir],
  );
  const { page, setPage, pageCount, pageRows, total, pageSize } = usePagination(sorted, 25);

  // Re-sorting should bring you back to the top of the newly-ordered list.
  useEffect(() => setPage(1), [sort.key, sort.dir, setPage]);

  // Drop selections that no longer exist (e.g. after a refresh removed archived rows).
  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(leads.map((l) => l.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [leads]);

  const pageIds = pageRows.map((l) => l.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) for (const id of pageIds) next.delete(id);
      else for (const id of pageIds) next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function archiveSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Archive ${ids.length} ${ids.length === 1 ? "lead" : "leads"}?`,
      description: "They'll be moved out of your pipeline. You can restore them anytime from the Archived view.",
      confirmLabel: "Archive",
      tone: "danger",
    });
    if (!ok) return;
    setArchiving(true);
    try {
      // allSettled so one failure doesn't strand the rest — some may have archived server-side.
      const results = await Promise.allSettled(ids.map((id) => api.delete(`/api/leads/${id}`)));
      const failed = results.filter((r) => r.status === "rejected").length;
      const done = ids.length - failed;
      if (done > 0) toast(`${done} ${done === 1 ? "lead" : "leads"} archived.`, "success");
      if (failed > 0) toast(`${failed} couldn't be archived — try again.`, "error");
    } finally {
      // Always reconcile: clear selection and refresh so the UI matches the server on every path.
      clearSelection();
      onChanged?.();
      setArchiving(false);
    }
  }

  const selectedCount = selected.size;

  return (
    <div className="px-4 pb-6 sm:px-6 lg:px-8">
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-paper shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-line bg-canvas/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
              <th className="w-10 px-5 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all on page"
                  checked={allOnPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                  }}
                  onChange={toggleAllOnPage}
                  className="size-4 cursor-pointer rounded border-line-strong accent-violet-600"
                />
              </th>
              <th className="px-5 py-3"><SortHeader label="Lead" sortKey="name" sort={sort} onToggle={toggle} /></th>
              <th className="px-5 py-3"><SortHeader label="Company" sortKey="company" sort={sort} onToggle={toggle} /></th>
              <th className="px-5 py-3"><SortHeader label="Stage" sortKey="stage" sort={sort} onToggle={toggle} /></th>
              <th className="px-5 py-3"><SortHeader label="Owner" sortKey="owner" sort={sort} onToggle={toggle} /></th>
              <th className="px-5 py-3 text-right"><SortHeader label="Est. value" sortKey="estValue" sort={sort} onToggle={toggle} align="right" /></th>
              <th className="px-5 py-3">Source</th>
              <th className="px-5 py-3 text-right"><SortHeader label="Activity" sortKey="activity" sort={sort} onToggle={toggle} align="right" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pageRows.map((l) => {
              const meta = STAGE_META[l.stage];
              const checked = selected.has(l.id);
              return (
                <tr
                  key={l.id}
                  onClick={() => router.push(`/leads/${l.id}`)}
                  className="cursor-pointer transition-colors hover:bg-violet-50/40 data-[selected=true]:bg-violet-50/60"
                  data-selected={checked}
                >
                  <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${l.name}`}
                      checked={checked}
                      onChange={() => toggleRow(l.id)}
                      className="size-4 cursor-pointer rounded border-line-strong accent-violet-600"
                    />
                  </td>
                  <td className="px-5 py-3.5 text-[13.5px] font-semibold text-ink">{l.name}</td>
                  <td className="px-5 py-3.5 text-[13px] text-muted">{l.company || "—"}</td>
                  <td className="px-5 py-3.5">
                    <Badge tint={meta.tint} dot={meta.dot}>{meta.label}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    {l.ownerName ? (
                      <span className="inline-flex items-center gap-2 text-[13px] text-ink-soft">
                        <Avatar name={l.ownerName} size={22} /> {l.ownerName}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-[13px] text-ink-soft tnum">{l.estValue > 0 ? formatINRCompact(l.estValue) : "—"}</td>
                  <td className="px-5 py-3.5 text-[13px] text-muted">{l.source}</td>
                  <td className="px-5 py-3.5 text-right text-[12.5px] text-faint"><Time value={l.lastActivityAt} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} />

      {selectedCount > 0 && (
        <div className="fixed inset-x-0 z-50 flex justify-center px-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6">
          <div className="animate-slide-in flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-paper px-4 py-2.5 shadow-[var(--shadow-pop)]">
            <span className="text-[13px] font-semibold text-ink tnum">{selectedCount} selected</span>
            <div className="h-5 w-px bg-line" />
            <Button size="sm" variant="danger" loading={archiving} onClick={archiveSelected}>
              <Archive className="size-3.5" /> Archive
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection} disabled={archiving}>
              <X className="size-3.5" /> Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
