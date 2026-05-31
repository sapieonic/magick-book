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
  estValue: number;
  notes: string;
  tags: string[];
  lostReason: string;
  ownerId: string;
  ownerName: string;
  convertedAccountId: string | null;
  order: number;
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

export interface ActivityDTO {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  actorName: string;
  createdAt: string;
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

export interface AccountFinance {
  billed: number;
  paid: number;
  outstanding: number;
  expenses: number;
  margin: number; // 0..1
}

export interface DashboardData {
  openLeads: number;
  qualified: number;
  wonThisMonth: number;
  activeAccounts: number;
  pipeline: { stage: LeadStage; count: number; value: number }[];
  revenueThisMonth: number;
  revenueDeltaPct: number;
  attention: AttentionItem[];
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
