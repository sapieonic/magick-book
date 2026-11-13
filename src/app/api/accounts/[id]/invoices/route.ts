import { type NextRequest } from "next/server";
import { ok, fail, route, serializeInvoice } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Invoice, type IInvoice } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { canEditOwned } from "@/lib/rbac";
import { logActivity, nextInvoiceNumber, audit, loadAccount } from "@/lib/services";
import { INVOICE_STATUSES } from "@/lib/constants";
import { DAY_MS } from "@/lib/dates";
import { formatINR } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/accounts/:id/invoices — newest first (archived accounts too).
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await loadAccount(user, id, "read");
  const invoices = await Invoice.find({ accountId: acc._id, deletedAt: null }).sort({ issuedAt: -1 }).lean<IInvoice[]>();
  return ok({ invoices: invoices.map((i) => serializeInvoice(i)) });
});

// POST /api/accounts/:id/invoices — bill a live account; due in 14 days unless given.
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await loadAccount(user, id, "write");
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only bill your own accounts.", 403);

  const b = await req.json().catch(() => ({}));
  const amount = Number(b.amount);
  if (!amount || amount <= 0) return fail("A positive amount is required");
  const status = INVOICE_STATUSES.includes(b.status) ? b.status : "sent";

  const number = await nextInvoiceNumber(user.workspaceId);
  const issuedAt = b.issuedAt ? new Date(b.issuedAt) : new Date();
  const dueAt = b.dueAt ? new Date(b.dueAt) : new Date(issuedAt.getTime() + 14 * DAY_MS);

  const inv = await Invoice.create({
    workspaceId: user.workspaceId,
    accountId: acc._id,
    number,
    issuedAt,
    dueAt,
    amount,
    status,
    paidAt: status === "paid" ? new Date() : null,
  });
  await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  await logActivity({
    workspaceId: user.workspaceId,
    accountId: acc._id,
    actorId: user._id,
    kind: "invoice",
    title: `Invoice #${number} ${status}`,
    detail: formatINR(amount),
  });
  await audit({ entity: "invoice", entityId: inv._id, entityLabel: `Invoice #${number}`, action: "create", actor: user, accountId: acc._id });

  return ok({ invoice: serializeInvoice(inv.toObject()) }, 201);
});
