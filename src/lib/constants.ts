// Shared domain enums + display metadata. Single source of truth used by both
// the data layer and the UI so labels/colors never drift.

export const LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Stages shown as pipeline columns (lost is handled separately). */
export const PIPELINE_STAGES = ["new", "contacted", "qualified", "proposal", "won"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_META: Record<LeadStage, { label: string; tint: string; dot: string }> = {
  new: { label: "New", tint: "bg-violet-50 text-violet-700 border-violet-200", dot: "#b0a3f8" },
  contacted: { label: "Contacted", tint: "bg-info-bg text-info border-info/30", dot: "#2f7fe0" },
  qualified: { label: "Qualified", tint: "bg-violet-100 text-violet-700 border-violet-300", dot: "#6d5cf5" },
  proposal: { label: "Proposal", tint: "bg-warn-bg text-warn border-warn/30", dot: "#c8810a" },
  won: { label: "Won", tint: "bg-success-bg text-success border-success/30", dot: "#15a05a" },
  lost: { label: "Lost", tint: "bg-danger-bg text-danger border-danger/30", dot: "#d6483f" },
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

/** Fixed colors for known defaults — deliberately distinct from STAGE_META. */
export const CATEGORY_META: Record<string, { label: string; tint: string; dot: string }> = {
  unclassified: { label: "Unclassified", tint: "bg-line text-ink-soft border-line-strong", dot: "#9aa3b2" },
  automobile: { label: "Automobile", tint: "bg-sky-50 text-sky-800 border-sky-200", dot: "#0284c7" },
  finance: { label: "Finance", tint: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "#059669" },
  collection: { label: "Collection", tint: "bg-amber-50 text-amber-900 border-amber-200", dot: "#d97706" },
  insurance: { label: "Insurance", tint: "bg-rose-50 text-rose-800 border-rose-200", dot: "#e11d48" },
  healthcare: { label: "Healthcare", tint: "bg-teal-50 text-teal-800 border-teal-200", dot: "#0d9488" },
};

/** Fallback palette for admin-added categories (avoids stage badge hues). */
const CATEGORY_TINT_FALLBACK = [
  { tint: "bg-sky-50 text-sky-800 border-sky-200", dot: "#0284c7" },
  { tint: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "#059669" },
  { tint: "bg-amber-50 text-amber-900 border-amber-200", dot: "#d97706" },
  { tint: "bg-rose-50 text-rose-800 border-rose-200", dot: "#e11d48" },
  { tint: "bg-teal-50 text-teal-800 border-teal-200", dot: "#0d9488" },
  { tint: "bg-indigo-50 text-indigo-800 border-indigo-200", dot: "#4f46e5" },
  { tint: "bg-orange-50 text-orange-900 border-orange-200", dot: "#ea580c" },
  { tint: "bg-cyan-50 text-cyan-800 border-cyan-200", dot: "#0891b2" },
] as const;

/** Title-case a stored category slug for display (keeps hyphens, e.g. e-commerce). */
export function formatCategoryLabel(category: string): string {
  if (!category) return "Unclassified";
  const known = CATEGORY_META[category.toLowerCase()];
  if (known) return known.label;
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

function hashCategory(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

/** Stable tint for a category slug — unclassified is always muted. */
export function categoryTint(category: string): string {
  return categoryMeta(category).tint;
}

export function categoryDot(category: string): string {
  return categoryMeta(category).dot;
}

export function categoryMeta(category: string): { label: string; tint: string; dot: string } {
  const key = (category || DEFAULT_LEAD_CATEGORY).toLowerCase();
  const known = CATEGORY_META[key];
  if (known) return known;
  const fb = CATEGORY_TINT_FALLBACK[hashCategory(key) % CATEGORY_TINT_FALLBACK.length];
  return { label: formatCategoryLabel(key), tint: fb.tint, dot: fb.dot };
}

export const ACCOUNT_STATUSES = ["active", "at_risk", "churned"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_META: Record<AccountStatus, { label: string; tint: string }> = {
  active: { label: "Active", tint: "bg-success-bg text-success border-success/30" },
  at_risk: { label: "At risk", tint: "bg-warn-bg text-warn border-warn/40" },
  churned: { label: "Churned", tint: "bg-danger-bg text-danger border-danger/30" },
};

export const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; tint: string }> = {
  draft: { label: "Draft", tint: "bg-line text-ink-soft border-line-strong" },
  sent: { label: "Sent", tint: "bg-warn-bg text-warn border-warn/40" },
  paid: { label: "Paid", tint: "bg-success-bg text-success border-success/30" },
  overdue: { label: "Overdue", tint: "bg-danger-bg text-danger border-danger/30" },
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

export const DOCUMENT_KIND_META: Record<DocumentKind, { label: string; tint: string }> = {
  proposal: { label: "Proposal", tint: "bg-info-bg text-info border-info/30" },
  agreement: { label: "Agreement", tint: "bg-violet-100 text-violet-700 border-violet-300" },
  other: { label: "Other", tint: "bg-line text-ink-soft border-line-strong" },
};

/* --------------------------------------------------------------- audit trail */

export const AUDIT_ACTIONS = ["create", "update", "delete", "restore"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_META: Record<AuditAction, { label: string; tint: string }> = {
  create: { label: "Created", tint: "bg-success-bg text-success border-success/30" },
  update: { label: "Updated", tint: "bg-info-bg text-info border-info/30" },
  delete: { label: "Archived", tint: "bg-danger-bg text-danger border-danger/30" },
  restore: { label: "Restored", tint: "bg-violet-50 text-violet-700 border-violet-200" },
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

/* ----------------------------------------------------------------- reminders */
// Reminders fire an outbound HTTP request ("call an API") to a per-user webhook
// configured in Settings. A cron-hit dispatch endpoint delivers them when due.

export const REMINDER_STATUSES = ["scheduled", "sent", "failed", "done", "canceled"] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_STATUS_META: Record<ReminderStatus, { label: string; tint: string }> = {
  scheduled: { label: "Scheduled", tint: "bg-info-bg text-info border-info/30" },
  sent: { label: "Sent", tint: "bg-success-bg text-success border-success/30" },
  failed: { label: "Failed", tint: "bg-danger-bg text-danger border-danger/30" },
  done: { label: "Done", tint: "bg-line text-ink-soft border-line-strong" },
  canceled: { label: "Canceled", tint: "bg-line text-ink-soft border-line-strong" },
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
