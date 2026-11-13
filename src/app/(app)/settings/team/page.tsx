"use client";
import { useState } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { PageSplit } from "@/components/layout/Page";
import { useSession } from "@/components/layout/SessionContext";
import { InviteModal, ROLE_COPY } from "@/components/settings/InviteModal";
import { AdminOnly, SettingsHeader } from "@/components/settings/SettingsTabs";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill, Tag } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Field";
import { ErrorState, RowsSkeleton } from "@/components/ui/Misc";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th, TwoLine } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import { ROLES, type Role } from "@/lib/constants";
import type { MemberDTO } from "@/lib/types";


const PERKS: Record<Role, [string, boolean][]> = {
  admin: [
    ["Sees and edits everything in the workspace", true],
    ["Invites people and changes roles", true],
    ["Invoices, expenses, settings and the audit log", true],
  ],
  standard: [
    ["Sees only the leads, accounts and money they added", true],
    ["Adds and edits their own pipeline", true],
    ["No team, settings or other people's data", false],
  ],
};

export default function TeamPage() {
  const me = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const isAdmin = me.role === "admin";
  const { data, loading, error, refresh } = useApi<{ members: MemberDTO[] }>(isAdmin ? "/api/members" : null);
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const members = data?.members ?? [];

  async function mutate(m: MemberDTO, fn: () => Promise<unknown>, done: string, failed: string) {
    setBusyId(m.id);
    try {
      await fn();
      toast(done, "success");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : failed, "error");
    } finally {
      setBusyId(null);
    }
  }

  function changeRole(m: MemberDTO, role: Role) {
    return mutate(m, () => api.patch(`/api/members/${m.id}`, { role }), `${m.name} is now ${role === "admin" ? "an admin" : "a standard user"}.`, "Couldn't change role");
  }

  async function remove(m: MemberDTO) {
    const ok = await confirm({
      title: `Remove ${m.name}?`,
      description: "They lose access to this workspace. The leads and accounts they own stay put.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (ok) await mutate(m, () => api.delete(`/api/members/${m.id}`), `${m.name} removed.`, "Couldn't remove");
  }

  return (
    <>
      <SettingsHeader
        title="Team & roles"
        actions={
          isAdmin && (
            <Button onClick={() => setInviting(true)}>
              <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Invite
            </Button>
          )
        }
      />

      {!isAdmin ? (
        <AdminOnly description="Team and roles are managed by workspace admins." />
      ) : error ? (
        <Panel>
          <ErrorState message={error} onRetry={refresh} />
        </Panel>
      ) : (
        <PageSplit
          railLabel="Roles"
          rail={(Object.keys(PERKS) as Role[]).map((r) => (
            <RolePanel key={r} role={r} />
          ))}
        >
          <Panel title="Members" meta={loading ? undefined : members.length} ruled>
            {loading ? (
              <RowsSkeleton rows={3} label="Loading members" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Member</Th>
                    <Th hideOnPhone>Email</Th>
                    <Th>Role</Th>
                    <Th hideOnPhone>Added by</Th>
                    <Th hideOnPhone>Status</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <MemberRow
                      key={m.id}
                      m={m}
                      busy={busyId === m.id}
                      onRole={(role) => changeRole(m, role)}
                      onRemove={() => remove(m)}
                    />
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </PageSplit>
      )}

      <InviteModal open={inviting} onClose={() => setInviting(false)} onInvited={refresh} />
    </>
  );
}

function MemberRow({ m, busy, onRole, onRemove }: { m: MemberDTO; busy: boolean; onRole: (r: Role) => void; onRemove: () => void }) {
  const fixed = m.isOwner || m.isYou;
  return (
    <tr>
      <Td>
        <span className="flex items-center gap-2.5 py-1.5">
          <Avatar name={m.name} size={28} tone={m.isYou ? "ink" : "neutral"} className="shrink-0" />
          <TwoLine
            primary={
              <>
                <span className="font-medium text-ink-1">{m.name}</span>
                {m.isYou && <span className="text-ink-3"> (you)</span>}
              </>
            }
            secondary={m.email}
            phoneOnly
          />
        </span>
      </Td>
      <Td hideOnPhone className="text-ink-2">{m.email}</Td>
      <Td>
        {fixed ? (
          <span className="inline-flex items-center gap-2">
            {ROLE_COPY[m.role].title}
            {m.isOwner && <Tag>owner</Tag>}
          </span>
        ) : (
          <div className="w-[150px]">
            <Select
              aria-label={`Role for ${m.name}`}
              value={m.role}
              disabled={busy}
              onChange={(e) => onRole(e.target.value as Role)}
              className="h-[30px]"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_COPY[r].title}</option>
              ))}
            </Select>
          </div>
        )}
      </Td>
      <Td hideOnPhone className="text-ink-2">{m.invitedByName ?? "–"}</Td>
      <Td hideOnPhone>
        <StatusPill tone={m.status === "active" ? "paid" : "due"}>{m.status === "active" ? "Active" : "Invited"}</StatusPill>
      </Td>
      <Td className="w-10 text-right">
        {!fixed && (
          <Button variant="ghost" size="sm" onClick={onRemove} loading={busy} aria-label={`Remove ${m.name}`}>
            <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
          </Button>
        )}
      </Td>
    </tr>
  );
}

function RolePanel({ role }: { role: Role }) {
  return (
    <Panel title={ROLE_COPY[role].title} meta={role === "admin" ? "all access" : "limited"} ruled>
      <ul>
        {PERKS[role].map(([perk, allowed]) => (
          <li key={perk} className="flex items-start gap-2.5 border-b border-line py-[9px] last:border-b-0">
            {allowed ? (
              <Check className="mt-0.5 size-4 shrink-0 text-paid" strokeWidth={1.5} aria-hidden />
            ) : (
              <Minus className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
            )}
            <span className={allowed ? "text-ink-1" : "text-ink-2"}>
              <span className="sr-only">{allowed ? "Can: " : "Cannot: "}</span>
              {perk}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
