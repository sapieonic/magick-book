// Shared domain enums + display metadata. Single source of truth used by both
// the data layer and the UI so labels/colors never drift.

export const LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "parked", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Sequential pipeline columns (lost is a separate view; parked is a holding lane). */
export const PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "won"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
/** Stages still being worked: the pipeline minus won. "Open leads" means these everywhere. */
export const OPEN_LEAD_STAGES = PIPELINE_STAGES.filter((s): s is Exclude<PipelineStage, "won"> => s !== "won");
export const isOpenLeadStage = (s: string | null | undefined): s is (typeof OPEN_LEAD_STAGES)[number] =>
  (OPEN_LEAD_STAGES as readonly string[]).includes(s ?? "");

/** Kanban columns, including the Parked holding lane after the sequential funnel. */
export const BOARD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "parked"] as const;
export type BoardStage = (typeof BOARD_STAGES)[number];

/** Board columns that collapse to a slim rail so the pipeline stays compact. */
export const COLLAPSIBLE_STAGES = ["won", "parked"] as const;
export type CollapsibleStage = (typeof COLLAPSIBLE_STAGES)[number];

/** Stages still working the funnel (excludes parked holding + lost). */
export function isActiveLeadStage(stage: string): boolean {
  return stage !== "lost" && stage !== "parked";
}

export function isCollapsibleStage(stage: string): stage is CollapsibleStage {
  return (COLLAPSIBLE_STAGES as readonly string[]).includes(stage);
}

export const STAGE_META: Record<LeadStage, { label: string }> = {
  new: { label: "New" },
  contacted: { label: "Contacted" },
  qualified: { label: "Qualified" },
  proposal: { label: "Proposal" },
  won: { label: "Won" },
  parked: { label: "Parked" },
  lost: { label: "Lost" },
};

export const LEAD_SOURCES = ["Website", "Referral", "Cold call", "Event", "Inbound", "Social", "Other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Default lead taxonomy — workspaces can extend this list from Settings. */
export const DEFAULT_LEAD_CATEGORIES = [
  "unclassified",
  "automobile",
  "finance",
  "collection",
  "insurance",
  "healthcare",
] as const;

export const DEFAULT_LEAD_CATEGORY = "unclassified";

/** Title-case a stored category slug for display (keeps hyphens, e.g. e-commerce). */
export function formatCategoryLabel(category: string): string {
  if (!category) return "Unclassified";
  return category
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) =>
      w
        .split("-")
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
        .join("-"),
    )
    .join(" ");
}

export const ACCOUNT_STATUSES = ["active", "at_risk", "churned"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_META: Record<AccountStatus, { label: string }> = {
  active: { label: "Active" },
  at_risk: { label: "At risk" },
  churned: { label: "Churned" },
};

export const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string }> = {
  draft: { label: "Draft" },
  sent: { label: "Sent" },
  paid: { label: "Paid" },
  overdue: { label: "Overdue" },
};

export const EXPENSE_CATEGORIES = [
  "Telephony",
  "Travel",
  "Software",
  "Marketing",
  "Salaries",
  "Office",
  "Other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const ROLES = ["admin", "standard"] as const;
export type Role = (typeof ROLES)[number];

export const MEMBER_STATUSES = ["active", "invited"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const CONTACT_METHODS = ["call", "whatsapp", "email", "sms"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

/* ----------------------------------------------------- documents (S3-backed) */

export const DOCUMENT_KINDS = ["proposal", "agreement", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_META: Record<DocumentKind, { label: string }> = {
  proposal: { label: "Proposal" },
  agreement: { label: "Agreement" },
  other: { label: "Other" },
};

/* --------------------------------------------------------------- audit trail */

export const AUDIT_ACTIONS = ["create", "update", "delete", "restore"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_META: Record<AuditAction, { label: string }> = {
  create: { label: "Created" },
  update: { label: "Updated" },
  delete: { label: "Archived" },
  restore: { label: "Restored" },
};

// Entity types tracked by the audit log.
export const AUDIT_ENTITIES = ["lead", "account", "contact", "invoice", "expense", "document"] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const ACTIVITY_KINDS = [
  "lead_created",
  "stage_change",
  "call",
  "whatsapp",
  "email",
  "sms",
  "note",
  "converted",
  "invoice",
  "expense",
  "reminder",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** A logged meeting is stored as a `note` activity with this title (there is no meeting kind). */
export const MEETING_TITLE = "Meeting logged";

/* ----------------------------------------------------------------- reminders */
// Reminders fire an outbound HTTP request ("call an API") to a per-user webhook
// configured in Settings. A cron-hit dispatch endpoint delivers them when due.

export const REMINDER_STATUSES = ["scheduled", "sent", "failed", "done", "canceled"] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];
/** Reminders still waiting on the user (delivered or not, but not done or canceled): Today's rule for "open". */
export const OPEN_REMINDER_STATUSES: readonly ReminderStatus[] = ["scheduled", "sent", "failed"];

export const REMINDER_STATUS_META: Record<ReminderStatus, { label: string }> = {
  scheduled: { label: "Scheduled" },
  sent: { label: "Sent" },
  failed: { label: "Failed" },
  done: { label: "Done" },
  canceled: { label: "Canceled" },
};

/** HTTP verbs allowed for the outbound reminder webhook. */
export const REMINDER_HTTP_METHODS = ["POST", "PUT", "PATCH", "GET"] as const;
export type ReminderHttpMethod = (typeof REMINDER_HTTP_METHODS)[number];

/** Placeholders that get substituted into the webhook payload template. */
export const REMINDER_TEMPLATE_VARS = [
  "title",
  "notes",
  "dueAt",
  "entityType",
  "entityName",
  "entityUrl",
  "reminderId",
  "userName",
  "userEmail",
] as const;

/** Sensible default body — shaped to drop straight into a Slack/Zapier webhook. */
export const DEFAULT_REMINDER_TEMPLATE = `{
  "text": "⏰ Reminder: {{title}}",
  "title": "{{title}}",
  "notes": "{{notes}}",
  "dueAt": "{{dueAt}}",
  "entity": "{{entityType}}",
  "entityName": "{{entityName}}",
  "url": "{{entityUrl}}",
  "reminderId": "{{reminderId}}"
}`;

/** How many delivery attempts before a reminder is marked `failed`. */
export const REMINDER_MAX_ATTEMPTS = 5;
