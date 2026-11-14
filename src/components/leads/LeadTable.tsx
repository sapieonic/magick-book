"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, X } from "lucide-react";
import { CategoryBadge } from "./CategoryBadge";
import { OwnerCell } from "@/components/ui/Avatar";
import { StageLabel } from "@/components/ui/Badge";
import { Staleness } from "@/components/ui/Staleness";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Money } from "@/components/ui/Money";
import { Portal } from "@/components/ui/Overlay";
import { Pagination, SortHeader, Table, Td, Th, TwoLine, sortRows, usePagination, useSort } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { BOARD_STAGES, STAGE_META } from "@/lib/constants";
import type { LeadDTO } from "@/lib/types";

/**
 * Leads as a sortable ledger (the Table and Lost views). Rows open the lead;
 * checkboxes select rows for bulk archive. On phones the row folds into two
 * lines: name over company, stage and value. `variant="lost"` swaps Source for
 * the lost reason. Archiving goes through `api`, whose change event reloads the
 * page's leads.
 */
export function LeadTable({ leads, variant = "active" }: { leads: LeadDTO[]; variant?: "active" | "lost" }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { sort, toggle } = useSort("activity", "desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const lost = variant === "lost";

  const sorted = useMemo(
    () =>
      sortRows(leads, sort, {
        name: (l) => l.name,
        company: (l) => l.company,
        // Sort stages along the board (New → Won → Parked), not alphabetically by label.
        stage: (l) => {
          const i = (BOARD_STAGES as readonly string[]).indexOf(l.stage);
          return i >= 0 ? i : BOARD_STAGES.length;
        },
        category: (l) => l.category || "",
        owner: (l) => l.ownerName,
        estValue: (l) => l.estValue,
        activity: (l) => {
          const t = Date.parse(l.lastActivityAt);
          return Number.isNaN(t) ? null : t;
        },
      }),
    [leads, sort],
  );
  const { page, setPage, pageCount, pageRows, total, pageSize } = usePagination(sorted, 25);

  // Re-sorting should bring you back to the top of the newly ordered list.
  useEffect(() => setPage(1), [sort.key, sort.dir, setPage]);

  // Drop selections that no longer exist (e.g. after a refresh removed archived rows).
  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(leads.map((l) => l.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [leads]);

  const pageIds = pageRows.map((l) => l.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = !allOnPageSelected && someOnPageSelected;
  }, [allOnPageSelected, someOnPageSelected]);

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
      for (const id of pageIds) {
        if (allOnPageSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
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
      // allSettled so one failure doesn't strand the rest: some may have archived server-side.
      const results = await Promise.allSettled(ids.map((id) => api.delete(`/api/leads/${id}`)));
      const failed = results.filter((r) => r.status === "rejected").length;
      const done = ids.length - failed;
      if (done > 0) toast(`${done} ${done === 1 ? "lead" : "leads"} archived.`, "success");
      if (failed > 0) toast(`${failed} couldn't be archived. Try again.`, "error");
    } finally {
      setSelected(new Set());
      setArchiving(false);
    }
  }

  const sortHead = (label: string, key: string, align?: "right") => <SortHeader label={label} sortKey={key} sort={sort} onToggle={toggle} align={align} />;

  return (
    <>
      <Table className="min-w-full">
        <thead>
          <tr>
            <Th className="w-8">
              <input
                ref={selectAllRef}
                type="checkbox"
                aria-label="Select all on page"
                checked={allOnPageSelected}
                onChange={toggleAllOnPage}
                className="size-4 cursor-pointer accent-[var(--color-accent)]"
              />
            </Th>
            <Th>{sortHead("Lead", "name")}</Th>
            <Th hideOnPhone>{sortHead("Company", "company")}</Th>
            <Th hideOnPhone>{sortHead("Category", "category")}</Th>
            <Th hideOnPhone>{sortHead("Stage", "stage")}</Th>
            <Th hideOnPhone>{sortHead("Owner", "owner")}</Th>
            <Th numeric>{sortHead("Est. value", "estValue", "right")}</Th>
            <Th hideOnPhone>{lost ? "Reason" : "Source"}</Th>
            <Th numeric hideOnPhone>
              {sortHead("Last activity", "activity", "right")}
            </Th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((l) => (
            <tr
              key={l.id}
              onClick={() => router.push(`/leads/${l.id}`)}
              data-selected={selected.has(l.id)}
              className="cursor-pointer hover:bg-hover data-[selected=true]:bg-accent-tint"
            >
              <Td onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select ${l.name}`}
                  checked={selected.has(l.id)}
                  onChange={() => toggleRow(l.id)}
                  className="size-4 cursor-pointer accent-[var(--color-accent)]"
                />
              </Td>
              <Td className="max-w-[260px]">
                <TwoLine
                  phoneOnly
                  primary={
                    <Link href={`/leads/${l.id}`} onClick={(e) => e.stopPropagation()} className="block truncate hover:underline">
                      {l.name}
                    </Link>
                  }
                  secondary={[l.company, STAGE_META[l.stage].label].filter(Boolean).join(" · ")}
                />
              </Td>
              <Td hideOnPhone className="text-ink-2">{l.company || <span className="text-ink-3">–</span>}</Td>
              <Td hideOnPhone>
                <CategoryBadge category={l.category} />
              </Td>
              <Td hideOnPhone>
                <StageLabel stage={l.stage} />
              </Td>
              <Td hideOnPhone>
                <OwnerCell name={l.ownerName} />
              </Td>
              <Td numeric>
                <Money value={l.estValue} />
              </Td>
              <Td hideOnPhone className="max-w-[220px] truncate text-ink-2">{(lost ? l.lostReason : l.source) || <span className="text-ink-3">–</span>}</Td>
              <Td numeric hideOnPhone className="text-ink-2">
                <Staleness since={l.lastActivityAt} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} onPage={setPage} />

      {selected.size > 0 && (
        <Portal>
          <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6">
            <div role="region" aria-label="Selection" className="glass-pop flex animate-rise items-center gap-3 rounded-card px-4 py-2.5">
              <span className="tnum text-[13px] font-medium">{selected.size} selected</span>
              <span className="h-5 w-px bg-line" aria-hidden />
              <Button size="sm" variant="danger" loading={archiving} onClick={archiveSelected}>
                <Archive className="size-4" strokeWidth={1.5} aria-hidden /> Archive
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={archiving}>
                <X className="size-4" strokeWidth={1.5} aria-hidden /> Clear
              </Button>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
