import { type NextRequest } from "next/server";
import { ok, fail, route, serializeInvoice, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Invoice, type IAccount, type IInvoice } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";
import { logActivity, nextInvoiceNumber } from "@/lib/services";
import { INVOICE_STATUSES } from "@/lib/constants";
import { formatINR } from "@/lib/utils";
import { Types } from "mongoose";

type Ctx = { params: Promise<{ id: string }> };

async function requireAccount(scope: Record<string, unknown>, id: string): Promise<IAccount> {
  const acc = await Account.findOne({ _id: id, ...scope }).lean<IAccount>();
  if (!acc) throw new HttpError("Account not found", 404);
  return acc;
}

export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  await requireAccount(accountScope(user), id);
  const invoices = await Invoice.find({ accountId: id }).sort({ issuedAt: -1 }).lean<IInvoice[]>();
  return ok({ invoices: invoices.map((i) => serializeInvoice(i)) });
});

export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await requireAccount(accountScope(user), id);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only bill your own accounts.", 403);

  const b = await req.json().catch(() => ({}));
  const amount = Number(b.amount);
  if (!amount || amount <= 0) return fail("A positive amount is required");
  const status = INVOICE_STATUSES.includes(b.status) ? b.status : "sent";

  const number = await nextInvoiceNumber(user.workspaceId as unknown as Types.ObjectId);
  const issuedAt = b.issuedAt ? new Date(b.issuedAt) : new Date();
  const dueAt = b.dueAt ? new Date(b.dueAt) : new Date(issuedAt.getTime() + 14 * 86400000);

  const inv = await Invoice.create({
    workspaceId: user.workspaceId,
    accountId: acc._id,
    number,
    issuedAt,
    dueAt,
    amount,
    status,
  });
  await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  await logActivity({
    workspaceId: user.workspaceId as unknown as Types.ObjectId,
    accountId: acc._id,
    actorId: user._id,
    kind: "invoice",
    title: `Invoice #${number} ${status}`,
    detail: formatINR(amount),
  });

  return ok({ invoice: serializeInvoice(inv.toObject()) }, 201);
});
