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
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
