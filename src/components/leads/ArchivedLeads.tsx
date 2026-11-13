"use client";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { CategoryBadge } from "./CategoryBadge";
import { OwnerCell } from "@/components/ui/Avatar";
import { StageLabel } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Table, Td, Th, TwoLine } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { STAGE_META } from "@/lib/constants";
import type { LeadDTO } from "@/lib/types";

/** Archived (soft-deleted) leads, each with a Restore action. */
export function ArchivedLeads({ leads, onChanged }: { leads: LeadDTO[]; onChanged: () => void }) {
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

  return (
    <Table className="min-w-full">
      <thead>
        <tr>
          <Th>Lead</Th>
          <Th hideOnPhone>Company</Th>
          <Th hideOnPhone>Category</Th>
          <Th hideOnPhone>Stage</Th>
          <Th hideOnPhone>Owner</Th>
          <Th numeric>Est. value</Th>
          <Th className="w-px">
            <span className="sr-only">Actions</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {leads.map((l) => (
          <tr key={l.id}>
            <Td>
              <TwoLine phoneOnly primary={l.name} secondary={[l.company, STAGE_META[l.stage].label].filter(Boolean).join(" · ")} />
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
            <Td className="text-right">
              <Button size="sm" loading={busyId === l.id} onClick={() => restore(l)} aria-label={`Restore ${l.name}`}>
                <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden /> Restore
              </Button>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
