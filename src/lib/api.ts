import "server-only";
import { NextResponse } from "next/server";
import { UnauthorizedError } from "./auth/server";
import type {
  ILead,
  IAccount,
  IContact,
  IInvoice,
  IExpense,
  IActivity,
  IUser,
} from "./models";
import type {
  LeadDTO,
  AccountDTO,
  ContactDTO,
  InvoiceDTO,
  ExpenseDTO,
  ActivityDTO,
  MemberDTO,
} from "./types";
import type { LeadStage, AccountStatus, InvoiceStatus, Role, MemberStatus, ActivityKind } from "./constants";

/* ---------------------------------------------------------- responses */

export function ok<T>(data: T, init?: number): NextResponse {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Wrap a route handler with consistent auth + error handling. */
export function route<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof UnauthorizedError) return fail("Unauthorized", 401);
      if (err instanceof HttpError) return fail(err.message, err.status);
      console.error("[api error]", err);
      const msg = err instanceof Error ? err.message : "Something went wrong";
      return fail(msg, 500);
    }
  };
}

export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------------------------------- serializers */

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);
const id = (v: unknown) => (v ? String(v) : "");

type OwnerLike = { _id: unknown; name?: string } | null | undefined;

export function serializeLead(l: ILead, ownerName = ""): LeadDTO {
  return {
    id: id(l._id),
    name: l.name,
    company: l.company ?? "",
    title: l.title ?? "",
    phone: l.phone ?? "",
    email: l.email ?? "",
    source: l.source,
    stage: l.stage as LeadStage,
    estValue: l.estValue ?? 0,
    notes: l.notes ?? "",
    tags: l.tags ?? [],
    lostReason: l.lostReason ?? "",
    ownerId: id(l.ownerId),
    ownerName,
    convertedAccountId: l.convertedAccountId ? id(l.convertedAccountId) : null,
    order: l.order ?? 0,
    lastActivityAt: iso(l.lastActivityAt) ?? "",
    createdAt: iso(l.createdAt) ?? "",
  };
}

export function serializeContact(c: IContact): ContactDTO {
  return {
    id: id(c._id),
    name: c.name,
    title: c.title ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    isPrimary: !!c.isPrimary,
    note: c.note ?? "",
  };
}

export function serializeAccount(
  a: IAccount,
  extra: { ownerName?: string; primaryContact?: IContact | null; contactCount?: number } = {},
): AccountDTO {
  return {
    id: id(a._id),
    name: a.name,
    domain: a.domain ?? "",
    industry: a.industry ?? "",
    status: a.status as AccountStatus,
    plan: a.plan ?? "",
    value: a.value ?? 0,
    customerSince: iso(a.customerSince) ?? "",
    ownerId: id(a.ownerId),
    ownerName: extra.ownerName ?? "",
    primaryContact: extra.primaryContact ? serializeContact(extra.primaryContact) : null,
    contactCount: extra.contactCount ?? 0,
    lastActivityAt: iso(a.lastActivityAt) ?? "",
    createdAt: iso(a.createdAt) ?? "",
  };
}

export function serializeInvoice(i: IInvoice, accountName?: string): InvoiceDTO {
  return {
    id: id(i._id),
    number: i.number,
    accountId: id(i.accountId),
    accountName,
    issuedAt: iso(i.issuedAt) ?? "",
    dueAt: iso(i.dueAt),
    amount: i.amount,
    status: i.status as InvoiceStatus,
  };
}

export function serializeExpense(e: IExpense, accountName?: string): ExpenseDTO {
  return {
    id: id(e._id),
    accountId: id(e.accountId),
    accountName,
    date: iso(e.date) ?? "",
    category: e.category,
    vendor: e.vendor,
    amount: e.amount,
    billable: !!e.billable,
  };
}

export function serializeActivity(a: IActivity, actorName = ""): ActivityDTO {
  return {
    id: id(a._id),
    kind: a.kind as ActivityKind,
    title: a.title,
    detail: a.detail ?? "",
    actorName,
    createdAt: iso(a.createdAt) ?? "",
  };
}

export function serializeMember(u: IUser, opts: { invitedByName?: string | null; isYou?: boolean }): MemberDTO {
  return {
    id: id(u._id),
    name: u.name,
    email: u.email,
    role: u.role as Role,
    status: u.status as MemberStatus,
    invitedByName: opts.invitedByName ?? null,
    isYou: !!opts.isYou,
  };
}

export { iso, id };
export type { OwnerLike };
