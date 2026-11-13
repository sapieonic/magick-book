"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";

/** Ask why a lead was lost, then move it to the lost stage. */
export function LostModal({
  open,
  leadId,
  name,
  onClose,
  onDone,
}: {
  open: boolean;
  leadId: string;
  name: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.patch(`/api/leads/${leadId}/stage`, { stage: "lost", lostReason: reason.trim() });
      toast(`${name} marked lost.`, "info");
      setReason("");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Mark as lost" subtitle={`What happened with ${name}?`} size="sm">
      <Field label="Reason" hint="optional">
        <Textarea autoFocus placeholder="Budget, timing, went with a competitor…" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-5 flex gap-3">
        <Button variant="danger" onClick={submit} loading={busy}>
          Mark lost
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
