import { formatMoney } from "@/components/ui/Money";
import { AUDIT_ACTION_META, STAGE_META, type LeadStage } from "@/lib/constants";
import { absoluteTime, shortDate } from "@/lib/utils";
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
  estValue: "Estimated value",
  isPrimary: "Primary",
  fromLead: "From lead",
  convertedAccount: "Converted to",
  customerSince: "Customer since",
};

const MONEY_FIELDS = new Set(["estValue", "value", "amount"]);

function label(field: string): string {
  return FIELD_LABEL[field] ?? field.charAt(0).toUpperCase() + field.slice(1);
}

function fmt(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "–";
  if (MONEY_FIELDS.has(field) && typeof v === "number") return formatMoney(v);
  if (field === "stage" && typeof v === "string" && v in STAGE_META) return STAGE_META[v as LeadStage].label;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function ChangeLine({ change }: { change: AuditChange }) {
  return (
    <p className="break-words">
      <span className="text-ink-1">{label(change.field)}</span>{" "}
      <span className="tnum text-ink-3">
        {change.from !== undefined && <>{fmt(change.field, change.from)} → </>}
        {fmt(change.field, change.to)}
      </span>
    </p>
  );
}

/**
 * Audit-log feed as a hairline list: what changed (field, from → to), then who
 * and when. `showEntity` adds the record type and name (the workspace log).
 */
export function AuditTimeline({ entries, showEntity = false }: { entries: AuditLogDTO[]; showEntity?: boolean }) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-[13px] text-ink-3">No history yet.</p>;
  }
  return (
    <ul className="text-[13px]">
      {entries.map((e) => (
        <li key={e.id} className="border-b border-line py-2 last:border-b-0">
          {showEntity && (
            <p className="truncate">
              <span className="text-ink-3">{ENTITY_LABEL[e.entity] ?? e.entity}</span>{" "}
              <span className="font-medium text-ink-1">{e.entityLabel || "–"}</span>
            </p>
          )}
          {(e.action !== "update" || e.changes.length === 0) && <p className="text-ink-1">{AUDIT_ACTION_META[e.action].label}</p>}
          {e.changes.map((c, i) => (
            <ChangeLine key={`${c.field}-${i}`} change={c} />
          ))}
          <p className="tnum text-[12px] text-ink-3">
            {e.actorName || "System"} ·{" "}
            <time dateTime={e.createdAt} title={absoluteTime(e.createdAt)}>
              {shortDate(e.createdAt)}
            </time>
          </p>
        </li>
      ))}
    </ul>
  );
}
