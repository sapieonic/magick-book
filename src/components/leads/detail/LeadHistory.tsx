"use client";
import { LinkButton } from "@/components/ui/Button";
import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { RowsSkeleton } from "@/components/ui/Misc";
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
          <LinkButton aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Show fewer" : `All ${entries.length} changes`}
          </LinkButton>
        )
      }
    >
      {loading ? (
        <RowsSkeleton rows={COLLAPSED} label="Loading history" />
      ) : (
        <AuditTimeline entries={open ? entries : entries.slice(0, COLLAPSED)} />
      )}
    </Panel>
  );
}
