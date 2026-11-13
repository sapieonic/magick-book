"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import type { Role } from "@/lib/constants";
import type { MemberDTO } from "@/lib/types";

export const ROLE_COPY: Record<Role, { title: string; desc: string }> = {
  admin: { title: "Admin", desc: "Sees and edits everything in the workspace." },
  standard: { title: "Standard user", desc: "Only sees the leads and accounts they add." },
};

export function InviteModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (m: MemberDTO) => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("standard");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return toast("Enter a valid work email.", "error");
    setBusy(true);
    try {
      const { member } = await api.post<{ member: MemberDTO }>("/api/members", { email: email.trim(), role });
      toast(`Invited ${member.email}.`, "success");
      onInvited(member);
      onClose();
      setEmail("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not invite", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite a teammate" subtitle="They join your workspace when they sign in with this email.">
      <form onSubmit={submit} className="space-y-5">
        <Field label="Work email" required>
          <Input autoFocus type="email" autoComplete="off" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>

        <fieldset>
          <legend className="mb-1 text-[12px] font-medium text-ink-2">Role</legend>
          <div className="space-y-2">
            {(Object.keys(ROLE_COPY) as Role[]).map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-start gap-3 rounded-card border border-line-strong bg-control p-3 transition-colors hover:bg-hover has-[:checked]:border-accent has-[:checked]:bg-accent-tint"
              >
                <input
                  type="radio"
                  name="invite-role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="mt-1 size-4 accent-accent"
                />
                <span>
                  <span className="block font-medium text-ink-1">{ROLE_COPY[r].title}</span>
                  <span className="block text-[13px] text-ink-2">{ROLE_COPY[r].desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {role === "standard" && (
          <p className="text-[13px] text-ink-2">
            They land on a Today view scoped to their own leads, accounts, invoices and expenses, and nothing else.
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" loading={busy}>Send invite</Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
