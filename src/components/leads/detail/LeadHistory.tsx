"use client";
import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Misc";
import { AuditTimeline } from "@/components/AuditTimeline";
import type { AuditLogDTO } from "@/lib/types";

const COLLAPSED = 3;

/** The lead's change history, latest few entries until expanded. */
export function LeadHistory({ entries, loading }: { entries: AuditLogDTO[]; loading: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title="History"
      ruled
      actions={
        entries.length > COLLAPSED && (
          <button type="button" className="link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Show fewer" : `All ${entries.length} changes`}
          </button>
        )
      }
    >
      {loading ? (
        <div className="space-y-3 py-2">
          {Array.from({ length: COLLAPSED }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <AuditTimeline entries={open ? entries : entries.slice(0, COLLAPSED)} />
      )}
    </Panel>
  );
}
