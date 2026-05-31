"use client";
import { useState } from "react";
import { ShieldCheck, User, Check, X, Plus, Lock, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { useSession } from "@/components/layout/SessionContext";
import { InviteModal } from "@/components/settings/InviteModal";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PageLoader, ErrorState, EmptyState } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { MemberDTO } from "@/lib/types";

interface MembersResponse {
  members: MemberDTO[];
  isAdmin: boolean;
}

const ADMIN_PERKS = ["Sees & edits everything in the workspace", "Invite people & change roles", "Billing, invoices, expenses & settings"];
const STANDARD_PERKS: [string, boolean][] = [
  ["Sees only records they added (leads, accounts, $)", true],
  ["Add & edit their own pipeline", true],
  ["No team, billing or others' data", false],
];

export default function TeamPage() {
  const me = useSession();
  const { toast } = useToast();
  const { data, loading, error, refresh } = useApi<MembersResponse>("/api/members");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const members = data?.members ?? [];
  const canManage = data?.isAdmin ?? false;

  async function changeRole(m: MemberDTO, role: string) {
    setBusyId(m.id);
    try {
      await api.patch(`/api/members/${m.id}`, { role });
      toast(`${m.name} is now ${role}.`, "success");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't change role", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(m: MemberDTO) {
    setBusyId(m.id);
    try {
      await api.delete(`/api/members/${m.id}`);
      toast(`${m.name} removed.`, "info");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't remove", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader>
        <nav className="flex items-center gap-1.5 text-[13px] text-muted">
          <span>Settings</span>
          <span className="text-faint">/</span>
          <span className="font-display text-[20px] font-bold tracking-tight text-ink">Team &amp; roles</span>
        </nav>
        {me.role === "admin" && (
          <Button variant="primary" className="ml-auto" onClick={() => setInviting(true)}>
            <Plus className="size-4" /> Invite user
          </Button>
        )}
      </PageHeader>

      <div className="px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-[1080px]">
          {error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : loading ? (
            <PageLoader />
          ) : !canManage ? (
            <EmptyState icon={<Lock className="size-6" />} title="Admins only" description="Team & roles is restricted to workspace admins." />
          ) : (
            <>
              {/* Role explainer cards */}
              <div className="grid gap-4 md:grid-cols-2">
                <RoleCard icon={ShieldCheck} title="Admin" badge="All access" tone="violet">
                  {ADMIN_PERKS.map((p) => (
                    <Perk key={p} ok>{p}</Perk>
                  ))}
                </RoleCard>
                <RoleCard icon={User} title="Standard user" badge="Limited" tone="neutral">
                  {STANDARD_PERKS.map(([p, ok]) => (
                    <Perk key={p} ok={ok}>{p}</Perk>
                  ))}
                </RoleCard>
              </div>

              {/* Members */}
              <h2 className="mb-3 mt-7 font-display text-[16px] font-bold text-ink">Members · {members.length}</h2>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                      <th className="px-5 py-3">Member</th>
                      <th className="px-5 py-3">Email</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Added by</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {members.map((m) => (
                      <tr key={m.id} className="text-[13px]">
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-2.5">
                            <Avatar name={m.name} size={30} />
                            <span className="font-semibold text-ink">{m.name}</span>
                            {m.isYou && <span className="text-[11.5px] text-faint">(you)</span>}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted">{m.email}</td>
                        <td className="px-5 py-3.5">
                          {m.isYou ? (
                            <Badge tone="violet">Admin · owner</Badge>
                          ) : (
                            <select
                              value={m.role}
                              disabled={busyId === m.id}
                              onChange={(e) => changeRole(m, e.target.value)}
                              className="cursor-pointer rounded-[var(--radius-sm)] border border-line-strong bg-paper px-2.5 py-1.5 text-[12.5px] font-semibold text-ink focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                            >
                              <option value="admin">Admin</option>
                              <option value="standard">Standard</option>
                            </select>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-muted">{m.invitedByName ?? "—"}</td>
                        <td className="px-5 py-3.5">
                          <Badge tone={m.status === "active" ? "success" : "warn"}>{m.status === "active" ? "Active" : "Invited"}</Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {!m.isYou && (
                            <button
                              disabled={busyId === m.id}
                              onClick={() => remove(m)}
                              className="rounded-md p-1.5 text-faint transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
                              aria-label={`Remove ${m.name}`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      <InviteModal open={inviting} onClose={() => setInviting(false)} onInvited={() => refresh()} />
    </>
  );
}

function RoleCard({ icon: Icon, title, badge, tone, children }: { icon: typeof ShieldCheck; title: string; badge: string; tone: "violet" | "neutral"; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex size-9 items-center justify-center rounded-[var(--radius-sm)]", tone === "violet" ? "bg-violet-100 text-violet-700" : "bg-canvas text-ink-soft")}>
          <Icon className="size-[18px]" />
        </span>
        <h3 className="font-display text-[16px] font-bold text-ink">{title}</h3>
        <Badge tone={tone} className="ml-1">{badge}</Badge>
      </div>
      <div className="my-4 border-t border-dashed border-line" />
      <ul className="space-y-2.5">{children}</ul>
    </Card>
  );
}

function Perk({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px]">
      <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full", ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
        {ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
      </span>
      <span className={ok ? "text-ink-soft" : "text-muted"}>{children}</span>
    </li>
  );
}
