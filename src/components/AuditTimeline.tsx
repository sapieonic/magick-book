"use client";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { AUDIT_ACTION_META } from "@/lib/constants";
import { relativeTime, formatINRCompact } from "@/lib/utils";
import type { AuditLogDTO, AuditChange } from "@/lib/types";

const ENTITY_LABEL: Record<string, string> = {
  lead: "Lead",
  account: "Account",
  contact: "Contact",
  invoice: "Invoice",
  expense: "Expense",
  document: "Document",
};

// Human labels for the fields we diff, so the trail reads in plain English.
const FIELD_LABEL: Record<string, string> = {
  estValue: "Est. value",
  isPrimary: "Primary",
  fromLead: "From lead",
  convertedAccount: "Converted to",
  customerSince: "Customer since",
};

function label(field: string): string {
  return FIELD_LABEL[field] ?? field.charAt(0).toUpperCase() + field.slice(1);
}

function fmt(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if ((field === "estValue" || field === "value") && typeof v === "number") return formatINRCompact(v);
  return String(v);
}

function ChangeRow({ field, change }: { field: string; change: AuditChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className="font-medium text-muted">{label(field)}:</span>
      {change.from !== undefined && (
        <>
          <span className="text-faint line-through">{fmt(field, change.from)}</span>
          <span className="text-faint">→</span>
        </>
      )}
      <span className="font-medium text-ink-soft">{fmt(field, change.to)}</span>
    </div>
  );
}

/** Renders an audit-log feed. `showEntity` adds the entity type+name line (used in the workspace log). */
export function AuditTimeline({ entries, showEntity = false }: { entries: AuditLogDTO[]; showEntity?: boolean }) {
  if (entries.length === 0) {
    return <p className="py-8 text-center text-[13px] text-faint">No history yet.</p>;
  }
  return (
    <ul className="space-y-4">
      {entries.map((e) => {
        const meta = AUDIT_ACTION_META[e.action];
        return (
          <li key={e.id} className="flex gap-3">
            <Avatar name={e.actorName || "System"} size={30} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tint={meta.tint}>{meta.label}</Badge>
                {showEntity && (
                  <span className="text-[12.5px] text-muted">
                    {ENTITY_LABEL[e.entity] ?? e.entity}
                  </span>
                )}
                <span className="truncate text-[13px] font-semibold text-ink">{e.entityLabel || "—"}</span>
                <span className="ml-auto shrink-0 text-[11.5px] text-faint">{relativeTime(e.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-[12px] text-muted">
                by {e.actorName || "System"}
              </p>
              {e.changes.length > 0 && (
                <div className="mt-2 space-y-1 rounded-[var(--radius-md)] border border-line bg-canvas/50 px-3 py-2">
                  {e.changes.map((c, i) => (
                    <ChangeRow key={`${c.field}-${i}`} field={c.field} change={c} />
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
