"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import type { LeadDTO, AccountDTO, MemberDTO } from "@/lib/types";

const PLANS = ["", "Starter", "Growth", "Scale", "Enterprise"];

export function ConvertModal({
  lead,
  open,
  onClose,
  onConverted,
}: {
  lead: LeadDTO;
  open: boolean;
  onClose: () => void;
  onConverted: (account: AccountDTO) => void;
}) {
  const { toast } = useToast();
  const [accountName, setAccountName] = useState(lead.company || lead.name);
  const [ownerId, setOwnerId] = useState(lead.ownerId);
  const [plan, setPlan] = useState("");
  const [members, setMembers] = useState<MemberDTO[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ accountName?: string }>({});

  const accountNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setAccountName(lead.company || lead.name);
      setOwnerId(lead.ownerId);
      setErrors({});
      api.get<{ members: MemberDTO[] }>("/api/members").then((d) => setMembers(d.members)).catch(() => setMembers([]));
    }
  }, [open, lead]);

  async function convert() {
    const nextErrors: typeof errors = {};
    if (!accountName.trim()) nextErrors.accountName = "Give the account a name.";
    // Owner is not required — the server falls back to the lead's owner when none is chosen.

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      accountNameRef.current?.focus();
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      const { account } = await api.post<{ account: AccountDTO }>(`/api/leads/${lead.id}/convert`, {
        accountName: accountName.trim(),
        ownerId,
        plan: plan || undefined,
      });
      toast(`${account.name} is now an active account 🎉`, "success");
      onConverted(account);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not convert", "error");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Convert to active account 🎉" subtitle={`${lead.name.split(" ")[0]}'s a win! We'll carry everything over so nothing's re-typed.`}>
      <div className="rounded-[var(--radius-md)] border border-dashed border-violet-300 bg-violet-50/70 p-4 text-[13px] leading-relaxed text-violet-900">
        <p>
          Lead contact <b>{lead.name}</b> → set as <b>primary contact</b>
        </p>
        <p className="mt-1.5">
          Company <b>{lead.company || lead.name}</b> → becomes the <b>account</b>
        </p>
        <p className="mt-1.5">
          Lifecycle &amp; history → <b>kept on the account</b>
        </p>
      </div>

      <div className="mt-5 space-y-4">
        <Field label="Account name" error={errors.accountName}>
          <Input
            ref={accountNameRef}
            aria-invalid={!!errors.accountName}
            value={accountName}
            onChange={(e) => {
              setAccountName(e.target.value);
              setErrors((err) => (err.accountName ? { ...err, accountName: undefined } : err));
            }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner">
            <Select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              {members.length === 0 && <option value={lead.ownerId}>{lead.ownerName || "Owner"}</option>}
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.isYou ? " (you)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Plan / tier" hint="optional">
            <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p || "choose"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Button variant="primary" onClick={convert} loading={busy}>
          Create account <ArrowRight className="size-4" />
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
