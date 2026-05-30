import { type NextRequest } from "next/server";
import { ok, fail, route, serializeInvoice, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Invoice, Account, type IInvoice, type IAccount } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";
import { INVOICE_STATUSES } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/invoices/:id — change status (e.g. mark paid) or send a reminder.
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;

  const inv = await Invoice.findOne({ _id: id, workspaceId: user.workspaceId }).lean<IInvoice>();
  if (!inv) throw new HttpError("Invoice not found", 404);
  const acc = await Account.findOne({ _id: inv.accountId, ...accountScope(user) }).lean<IAccount>();
  if (!acc) throw new HttpError("Invoice not found", 404);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only manage your own invoices.", 403);

  const b = await req.json().catch(() => ({}));

  // "remind" is a no-op state nudge in this demo (would email/WhatsApp in prod).
  if (b.action === "remind") {
    return ok({ invoice: serializeInvoice(inv), reminded: true });
  }

  if (b.status && INVOICE_STATUSES.includes(b.status)) {
    await Invoice.updateOne({ _id: inv._id }, { status: b.status });
    const fresh = await Invoice.findById(inv._id).lean<IInvoice>();
    return ok({ invoice: serializeInvoice(fresh!) });
  }
  return fail("Nothing to update");
});
