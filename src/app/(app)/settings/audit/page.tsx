"use client";
import { useState } from "react";
import { ScrollText } from "lucide-react";
import { useSession } from "@/components/layout/SessionContext";
import { AdminOnly, SettingsHeader } from "@/components/settings/SettingsTabs";
import { AuditTimeline } from "@/components/AuditTimeline";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/ui/Misc";
import { Panel } from "@/components/ui/Panel";
import { useApi } from "@/lib/client";
import { AUDIT_ACTION_META, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/constants";
import type { AuditLogDTO, MemberDTO } from "@/lib/types";

type Filters = { entity: string; action: string; actorId: string };
const NO_FILTERS: Filters = { entity: "", action: "", actorId: "" };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function AuditLogPage() {
  const me = useSession();
  const isAdmin = me.role === "admin";
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const { data, loading, error, refresh } = useApi<{ entries: AuditLogDTO[] }>(isAdmin ? `/api/audit${query ? `?${query}` : ""}` : null);
  const team = useApi<{ members: MemberDTO[] }>(isAdmin ? "/api/members" : null);

  const entries = data?.entries ?? [];
  const filtered = query !== "";
  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <SettingsHeader title="Audit log" />

      {!isAdmin ? (
        <AdminOnly description="The workspace audit log is visible to admins." />
      ) : (
        <>
          <Panel aria-label="Filter the audit log">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Record" className="w-full sm:w-44">
                <Select value={filters.entity} onChange={set("entity")}>
                  <option value="">All records</option>
                  {AUDIT_ENTITIES.map((e) => (
                    <option key={e} value={e}>{capitalize(e)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Change" className="w-full sm:w-44">
                <Select value={filters.action} onChange={set("action")}>
                  <option value="">All changes</option>
                  {AUDIT_ACTIONS.map((a) => (
                    <option key={a} value={a}>{AUDIT_ACTION_META[a].label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Person" className="w-full sm:w-52">
                <Select value={filters.actorId} onChange={set("actorId")}>
                  <option value="">Everyone</option>
                  {(team.data?.members ?? []).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
              </Field>
              {filtered && (
                <Button type="button" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
                  Clear filters
                </Button>
              )}
            </div>
          </Panel>

          <Panel title="Workspace log" meta={loading ? undefined : entries.length} actions={<span>Newest first</span>} ruled>
            <div className="pt-4">
              {error ? (
                <ErrorState message={error} onRetry={refresh} />
              ) : loading ? (
                <RowsSkeleton rows={4} label="Loading audit log" />
              ) : entries.length === 0 ? (
                <EmptyState
                  icon={<ScrollText className="size-6" strokeWidth={1.5} aria-hidden />}
                  title={filtered ? "Nothing matches these filters" : "No activity yet"}
                  description={filtered ? "Try a different record, change or person." : "Changes across the workspace are recorded here."}
                />
              ) : (
                <AuditTimeline entries={entries} showEntity />
              )}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
