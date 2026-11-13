"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Overlay";
import { Field, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";

const METHODS = [
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "meeting", label: "Meeting" },
] as const;
type Method = (typeof METHODS)[number]["value"];

/** Log a reach-out on a lead's timeline straight from the work queue. */
export function LogActivityModal({
  lead,
  onClose,
  onLogged,
}: {
  lead: { id: string; label: string } | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const { toast } = useToast();
  const [method, setMethod] = useState<Method>("call");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const label = METHODS.find((m) => m.value === method)!.label;

  function close() {
    setMethod("call");
    setDetail("");
    onClose();
  }

  async function submit() {
    if (!lead) return;
    setBusy(true);
    try {
      await api.post(`/api/leads/${lead.id}/activities`, { kind: method, detail: detail.trim() });
      toast(`${label} logged for ${lead.label}.`, "success");
      close();
      onLogged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't log that", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!lead} onClose={close} title="Log activity" subtitle={lead?.label} size="sm">
      <SegmentedControl aria-label="How you reached out" options={[...METHODS]} value={method} onChange={setMethod} size="sm" className="mb-4 max-w-full flex-wrap" />
      <Field label="What happened?">
        <Textarea autoFocus placeholder="What was said, and what happens next…" value={detail} onChange={(e) => setDetail(e.target.value)} />
      </Field>
      <div className="mt-5 flex gap-3">
        <Button variant="primary" onClick={submit} loading={busy}>
          Save
        </Button>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
