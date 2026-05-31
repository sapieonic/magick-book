"use client";
import { useState } from "react";
import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { useSession } from "@/components/layout/SessionContext";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { AuditTimeline } from "@/components/AuditTimeline";
import { Card, PageLoader, ErrorState, EmptyState } from "@/components/ui/Misc";
import { useApi } from "@/lib/client";
import { AUDIT_ENTITIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AuditLogDTO } from "@/lib/types";

const FILTERS = [{ key: "", label: "All" }, ...AUDIT_ENTITIES.map((e) => ({ key: e, label: e.charAt(0).toUpperCase() + e.slice(1) }))];

export default function AuditLogPage() {
  const me = useSession();
  const [entity, setEntity] = useState("");
  const url = `/api/audit${entity ? `?entity=${entity}` : ""}`;
  const { data, loading, error, refresh } = useApi<{ entries: AuditLogDTO[] }>(me.role === "admin" ? url : null);

  return (
    <>
      <PageHeader>
        <nav className="flex items-center gap-1.5 text-[13px] text-muted">
          <span>Settings</span>
          <span className="text-faint">/</span>
          <span className="font-display text-[20px] font-bold tracking-tight text-ink">Audit log</span>
        </nav>
      </PageHeader>

      <SettingsTabs />

      <div className="px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-[820px]">
          {me.role !== "admin" ? (
            <EmptyState icon={<ScrollText className="size-6" />} title="Admins only" description="The workspace audit log is visible to admins." />
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setEntity(f.key)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all",
                      entity === f.key ? "border-violet-300 bg-violet-50 text-violet-700" : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {error ? (
                <ErrorState message={error} onRetry={refresh} />
              ) : loading ? (
                <PageLoader label="Loading audit log…" />
              ) : (data?.entries ?? []).length === 0 ? (
                <EmptyState icon={<ScrollText className="size-6" />} title="No activity yet" description="Changes across the workspace will be recorded here." />
              ) : (
                <Card className="p-6">
                  <AuditTimeline entries={data?.entries ?? []} showEntity />
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
