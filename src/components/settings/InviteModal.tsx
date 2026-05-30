"use client";
import { useState } from "react";
import { Check, ShieldCheck, User } from "lucide-react";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { MemberDTO } from "@/lib/types";

const ROLE_OPTIONS = [
  { key: "admin", icon: ShieldCheck, title: "Admin", desc: "All access — everything in the workspace." },
  { key: "standard", icon: User, title: "Standard user", desc: "Only sees the leads & accounts they add." },
] as const;

export function InviteModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (m: MemberDTO) => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "standard">("standard");
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function submit() {
    if (!email.includes("@")) return toast("Enter a valid work email.", "error");
    setBusy(true);
    try {
      const { member } = await api.post<{ member: MemberDTO }>("/api/members", { email: email.trim(), role });
      toast(`Invite sent to ${member.email}.`, "success");
      onInvited(member);
      onClose();
      setEmail("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not invite", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Invite a teammate" subtitle="They'll get an email to join your workspace.">
      <div className="space-y-5">
        <Field label="Work email" required>
          <Input autoFocus type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>

        <div>
          <p className="mb-2 text-[12.5px] font-semibold text-ink-soft">Choose a role</p>
          <div className="space-y-2.5">
            {ROLE_OPTIONS.map((r) => {
              const active = role === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => setRole(r.key)}
                  className={cn(
                    "flex w-full items-center gap-3.5 rounded-[var(--radius-md)] border p-3.5 text-left transition-all",
                    active ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100" : "border-line-strong hover:border-faint",
                  )}
                >
                  <span className={cn("flex size-9 items-center justify-center rounded-full", active ? "bg-violet-500 text-white" : "bg-canvas text-muted")}>
                    {active ? <Check className="size-4" /> : <r.icon className="size-4" />}
                  </span>
                  <div>
                    <p className="text-[14px] font-bold text-ink">{r.title}</p>
                    <p className="text-[12.5px] text-muted">{r.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {role === "standard" && (
          <div className="rounded-[var(--radius-md)] border border-violet-200 bg-violet-50/60 p-3.5 text-[12.5px] leading-relaxed text-violet-800">
            🐢 They&apos;ll land on a dashboard scoped to <b>their own</b> leads, accounts, invoices &amp; expenses — nothing else.
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={submit} loading={busy}>Send invite</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <span className="ml-auto text-[11.5px] text-faint">via email + WhatsApp</span>
        </div>
      </div>
    </Modal>
  );
}
