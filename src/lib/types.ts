// Plain-JSON shapes returned by the API and consumed by client components.
// (Mongoose docs are serialized to these via the `serialize*` helpers in api.ts)

import type {
  LeadStage,
  AccountStatus,
  InvoiceStatus,
  Role,
  MemberStatus,
  ActivityKind,
  DocumentKind,
  AuditAction,
  AuditEntity,
  ReminderStatus,
  ReminderHttpMethod,
} from "./constants";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: MemberStatus;
  authProvider: string;
  workspaceId: string | null;
  workspaceName: string | null;
}

export interface MemberDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: MemberStatus;
  invitedByName: string | null;
  isYou: boolean;
  /** The workspace owner: always an admin, cannot be demoted or removed. */
  isOwner: boolean;
}

export interface LeadDTO {
  id: string;
  name: string;
  company: string;
  title: string;
  phone: string;
  email: string;
  source: string;
  stage: LeadStage;
  category: string;
  estValue: number;
  notes: string;
  tags: string[];
  lostReason: string;
  ownerId: string;
  ownerName: string;
  convertedAccountId: string | null;
  order: number;
  /** Count of `note` activities on the lead — the "comments" shown on board cards. */
  commentCount: number;
  lastActivityAt: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ContactDTO {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  note: string;
}

export interface AccountDTO {
  id: string;
  name: string;
  domain: string;
  industry: string;
  status: AccountStatus;
  plan: string;
  value: number;
  customerSince: string;
  ownerId: string;
  ownerName: string;
  primaryContact: ContactDTO | null;
  contactCount: number;
  lastActivityAt: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface InvoiceDTO {
  id: string;
  number: number;
  accountId: string;
  accountName?: string;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  amount: number;
  status: InvoiceStatus;
  hasFile: boolean;
  fileName: string | null;
}

export interface ExpenseDTO {
  id: string;
  accountId: string;
  accountName?: string;
  date: string;
  category: string;
  vendor: string;
  amount: number;
  billable: boolean;
}

/** Days-past-due bands for outstanding invoices, oldest last. */
export type AgingKey = "current" | "d30" | "d60" | "d60plus";

export interface AgingBucketDTO {
  key: AgingKey;
  amount: number;
  count: number;
  /** Account names in the bucket, largest balance first. */
  accounts: string[];
}

/** One stacked series in the collected-by-month chart: a top account or "Other". */
export interface CollectedSeriesDTO {
  /** Account id, or "other" for the remainder. */
  key: string;
  name: string;
  total: number;
}

export interface CollectedMonthDTO {
  /** yyyy-MM (UTC). */
  key: string;
  total: number;
  /** Amount per series, in `CollectedDTO.series` order. */
  amounts: number[];
}

export interface CollectedDTO {
  /** Oldest to newest. */
  months: CollectedMonthDTO[];
  series: CollectedSeriesDTO[];
  total: number;
}

export interface MoneyTotals {
  /** Every issued (non-draft) invoice. */
  billed: number;
  billedCount: number;
  paid: number;
  paidCount: number;
  outstanding: number;
  outstandingCount: number;
  /** Outstanding invoices past their due date. */
  overdueCount: number;
  expenses: number;
  /** (billed − expenses) / billed, floored at 0; 0 when nothing is billed. */
  margin: number;
}

/** `GET /api/money`. */
export interface MoneySummary {
  /** Server clock the aging was computed against (ISO). */
  asOf: string;
  invoices: InvoiceDTO[];
  expenses: ExpenseDTO[];
  totals: MoneyTotals;
  aging: AgingBucketDTO[];
  collected: CollectedDTO;
}

export interface ActivityDTO {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  actorId: string;
  actorName: string;
  createdAt: string;
  editedAt: string | null;
}

export interface DocumentDTO {
  id: string;
  accountId: string;
  kind: DocumentKind;
  title: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  uploadedByName: string;
  createdAt: string;
}

export interface AuditChange {
  field: string;
  from?: unknown;
  to?: unknown;
}

export interface AuditLogDTO {
  id: string;
  entity: AuditEntity;
  entityId: string;
  entityLabel: string;
  action: AuditAction;
  actorName: string;
  changes: AuditChange[];
  leadId: string | null;
  accountId: string | null;
  createdAt: string;
}

export interface ReminderDTO {
  id: string;
  title: string;
  notes: string;
  dueAt: string;
  status: ReminderStatus;
  /** Linked record, if any. */
  leadId: string | null;
  accountId: string | null;
  entityLabel: string;
  attempts: number;
  sentAt: string | null;
  lastError: string;
  createdAt: string;
}

export interface ReminderHeaderDTO {
  key: string;
  value: string;
}

export interface ReminderSettingDTO {
  enabled: boolean;
  url: string;
  method: ReminderHttpMethod;
  headers: ReminderHeaderDTO[];
  payloadTemplate: string;
}

export interface AccountFinance {
  billed: number;
  paid: number;
  outstanding: number;
  expenses: number;
  margin: number; // 0..1
}

/** Per-row money rollup on `GET /api/accounts`: the account finance plus its overdue share. */
export interface AccountListFinance extends AccountFinance {
  overdue: number;
}

/** A row of `GET /api/accounts`. */
export interface AccountListItem extends AccountDTO {
  finance: AccountListFinance;
}

export interface DashboardData {
  /** When the server computed this snapshot (ISO). */
  asOf: string;
  openLeads: number;
  /** Estimated value of the open leads (new → proposal). */
  openValue: number;
  qualified: number;
  wonThisMonth: number;
  /** Won leads that have been converted into accounts. */
  wonConverted: number;
  activeAccounts: number;
  pipeline: PipelineStageSummary[];
  /** Follow-ups, due reminders and overdue invoices, oldest first. */
  queue: WorkItem[];
  receivables: DashboardReceivables;
  /** The signed-in user's reminders due after today and within the next 7 days. */
  upcoming: UpcomingReminder[];
  /** @deprecated No longer rendered; kept for API compatibility. */
  revenueThisMonth: number;
  /** @deprecated No longer rendered; kept for API compatibility. */
  revenueDeltaPct: number;
  /** @deprecated Superseded by `queue`; kept for API compatibility. */
  attention: AttentionItem[];
}

/** A lead pointer on a pipeline stage (its oldest untouched or latest lead). */
export interface StageLeadRef {
  id: string;
  name: string;
  company: string;
  lastActivityAt: string;
}

export interface PipelineStageSummary {
  stage: LeadStage;
  count: number;
  value: number;
  /** Lead in this stage untouched the longest. */
  oldest: StageLeadRef | null;
  /** Most recently touched lead in this stage (for Won: the latest win). */
  latest: StageLeadRef | null;
}

export type WorkItemKind = "followup" | "reminder" | "invoice";

/** One row of the Today work queue. */
export interface WorkItem {
  id: string;
  kind: WorkItemKind;
  /** The next action, e.g. "Call back Naresh" or a reminder's title. */
  title: string;
  /** Who it is about: the lead's or account's name ("" for a standalone reminder). */
  name: string;
  /** The lead's company, when the row is about a lead. */
  company: string;
  href: string | null;
  stage: LeadStage | null;
  /** Lead estimate or invoice amount. */
  value: number;
  /** Reminder due time, or the invoice's due (else issue) date. */
  dueAt: string | null;
  lastTouchedAt: string | null;
  ownerName: string;
  leadId: string | null;
  reminderId: string | null;
  invoiceId: string | null;
  invoiceNumber: number | null;
}

/** Outstanding amounts by days past due (due date, else issue date). */
export interface ReceivablesAging {
  current: number;
  d1_30: number;
  d31_60: number;
  d60plus: number;
}

export interface DashboardReceivables {
  billed: number;
  outstanding: number;
  aging: ReceivablesAging;
  /** How many accounts owe money. */
  owingAccounts: number;
  /** The five accounts owing the most, largest first. */
  debtors: { accountId: string; name: string; amount: number; invoices: number }[];
  collected: {
    thisMonth: number;
    lastMonth: number;
    payments: number;
    latest: { accountId: string; accountName: string; number: number } | null;
  };
}

export interface UpcomingReminder {
  id: string;
  title: string;
  dueAt: string;
  entityLabel: string;
  href: string | null;
}

export interface AttentionItem {
  id: string;
  kind: "lead_followup" | "invoice_overdue";
  title: string;
  tag: string;
  tagTone: "neutral" | "warn" | "danger" | "success";
  action: string;
  href: string;
}

/** Sidebar counts from `GET /api/nav`. */
export interface NavSummary {
  /** Leads in the working funnel (not won, parked or lost). */
  openLeads: number;
  accounts: number;
  /** Sum of sent + overdue invoices across visible accounts. */
  moneyDue: number;
  recentAccounts: { id: string; name: string }[];
}

/** One stretch a lead spent in a stage, folded from its audit trail. `leftAt` is null for the stage it is in now. */
export interface LeadStageSpan {
  stage: LeadStage;
  enteredAt: string;
  leftAt: string | null;
}

/** `GET /api/leads/:id`: the lead page's payload. */
export interface LeadDetail {
  lead: LeadDTO;
  /** Newest first. */
  activities: ActivityDTO[];
  /** Oldest first. */
  stages: LeadStageSpan[];
  /** The viewer's earliest open reminder on this lead (scheduled, sent or failed). */
  nextStep: ReminderDTO | null;
}
