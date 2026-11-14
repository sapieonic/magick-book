"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
      toast(`${account.name} is now an active account.`, "success");
      onConverted(account);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not convert", "error");
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convert to account"
      subtitle="Everything carries over, so nothing is typed twice."
    >
      <ul className="rounded-card bg-sunk px-4 py-1 text-[13px] text-ink-2">
        <CarryRow from={<>Contact <b className="font-medium text-ink-1">{lead.name}</b></>} to="Primary contact" />
        <CarryRow from={<>Company <b className="font-medium text-ink-1">{lead.company || lead.name}</b></>} to="The account" />
        <CarryRow from="Activity and history" to="Kept on the account" />
      </ul>

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
          Create account <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

function CarryRow({ from, to }: { from: ReactNode; to: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 border-b border-line py-2 last:border-b-0">
      <span>{from}</span>
      <span aria-hidden>→</span>
      <span className="sr-only">becomes</span>
      <span className="text-ink-1">{to}</span>
    </li>
  );
}
