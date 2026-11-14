"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { LeadDTO } from "@/lib/types";

const QUICK_REASONS = ["Price", "Competitor", "No response", "Bad timing", "Not a fit"] as const;

/** Ask why a lead was lost, then move it to the Lost stage. Open while `lead` is set. */
export function LostLeadModal({ lead, onClose, onDone }: { lead: Pick<LeadDTO, "id" | "name"> | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setReason(""), [lead?.id]);

  async function submit(overrideReason?: string) {
    if (!lead) return;
    setBusy(true);
    try {
      await api.patch(`/api/leads/${lead.id}/stage`, { stage: "lost", lostReason: (overrideReason ?? reason).trim() });
      toast(`${lead.name} marked lost.`, "info");
      onDone();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!lead} onClose={onClose} title="Mark as lost" subtitle={`What happened with ${lead?.name ?? "this lead"}?`} size="sm">
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Common reasons">
        {QUICK_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            disabled={busy}
            onClick={() => submit(r)}
            className={cn(
              "rounded-full border border-line-strong px-3 py-1 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink-1 disabled:cursor-not-allowed disabled:opacity-50",
              reason.trim().toLowerCase() === r.toLowerCase() && "bg-sunk text-ink-1",
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <Field label="Reason" hint="pick one above or write your own">
        <Textarea autoFocus placeholder="Budget, went with a competitor…" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-5 flex gap-3">
        <Button variant="danger" onClick={() => submit()} loading={busy}>
          Mark lost
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
