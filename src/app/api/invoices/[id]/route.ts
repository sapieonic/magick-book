import { type NextRequest } from "next/server";
import { ok, fail, route, serializeInvoice, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Invoice, Account, type IInvoice, type IAccount, type IUser } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";
import { audit } from "@/lib/services";
import { INVOICE_STATUSES } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

async function loadInvoice(
  user: IUser,
  id: string,
  opts?: { archived?: boolean },
): Promise<{ inv: IInvoice; acc: IAccount }> {
  const inv = await Invoice.findOne({
    _id: id,
    workspaceId: user.workspaceId,
    deletedAt: opts?.archived ? { $ne: null } : null,
  }).lean<IInvoice>();
  if (!inv) throw new HttpError("Invoice not found", 404);
  // Parent account visibility (live scope) — archived accounts hide their invoices.
  const acc = await Account.findOne({ _id: inv.accountId, ...accountScope(user) }).lean<IAccount>();
  if (!acc) throw new HttpError("Invoice not found", 404);
  return { inv, acc };
}

// PATCH /api/invoices/:id — change status (e.g. mark paid), send a reminder, or restore an archived invoice.
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));

  // Restore path loads from the ARCHIVED set (the live scope hides it).
  if (b.action === "restore") {
    const { inv, acc } = await loadInvoice(user, id, { archived: true });
    if (!canEditOwned(user, acc.ownerId)) return fail("You can only restore your own invoices.", 403);
    await Invoice.updateOne({ _id: inv._id }, { $unset: { deletedAt: "", deletedBy: "" } });
    await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
    await audit({
      entity: "invoice", entityId: inv._id, entityLabel: `Invoice #${inv.number}`, action: "restore", actor: user,
      accountId: inv.accountId,
    });
    const fresh = await Invoice.findById(inv._id).lean<IInvoice>();
    return ok({ invoice: serializeInvoice(fresh!) });
  }

  const { inv, acc } = await loadInvoice(user, id);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only manage your own invoices.", 403);

  // "remind" is a no-op state nudge in this demo (would email/WhatsApp in prod).
  if (b.action === "remind") {
    return ok({ invoice: serializeInvoice(inv), reminded: true });
  }

  if (b.status && INVOICE_STATUSES.includes(b.status)) {
    const patch: { status: typeof b.status; paidAt?: Date | null } = { status: b.status };
    // Stamp paidAt on the transition into paid; clear it if status leaves paid.
    if (b.status === "paid" && inv.status !== "paid") patch.paidAt = new Date();
    else if (b.status !== "paid" && inv.status === "paid") patch.paidAt = null;

    await Invoice.updateOne({ _id: inv._id }, patch);
    await audit({
      entity: "invoice", entityId: inv._id, entityLabel: `Invoice #${inv.number}`, action: "update", actor: user,
      changes: [{ field: "status", from: inv.status, to: b.status }], accountId: inv.accountId,
    });
    const fresh = await Invoice.findById(inv._id).lean<IInvoice>();
    return ok({ invoice: serializeInvoice(fresh!) });
  }
  return fail("Nothing to update");
});

// DELETE /api/invoices/:id — soft-delete (archive). The invoice number is kept
// so nextInvoiceNumber never reissues it; billed/paid/outstanding drop it.
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const { inv, acc } = await loadInvoice(user, id);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only manage your own invoices.", 403);

  await Invoice.updateOne({ _id: inv._id }, { deletedAt: new Date(), deletedBy: user._id });
  await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  await audit({
    entity: "invoice", entityId: inv._id, entityLabel: `Invoice #${inv.number}`, action: "delete", actor: user,
    accountId: inv.accountId,
  });
  return ok({ ok: true });
});
