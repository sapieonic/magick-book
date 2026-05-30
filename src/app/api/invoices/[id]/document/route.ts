import { type NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { ok, fail, route, serializeInvoice, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Invoice, Account, type IInvoice, type IAccount } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";
import { isS3Configured, putObject, presignGetUrl, invoiceKey } from "@/lib/s3";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg"]);

async function loadScoped(userScope: Record<string, unknown>, id: string, workspaceId: Types.ObjectId) {
  const invoice = await Invoice.findOne({ _id: id, workspaceId }).lean<IInvoice>();
  if (!invoice) throw new HttpError("Invoice not found", 404);
  const account = await Account.findOne({ _id: invoice.accountId, ...userScope }).lean<IAccount>();
  if (!account) throw new HttpError("Invoice not found", 404);
  return { invoice, account };
}

/**
 * POST /api/invoices/:id/document — persist an externally-generated invoice
 * file (multipart form field "file") to S3 and record it on the invoice.
 */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const { invoice, account } = await loadScoped(accountScope(user), id, user.workspaceId);
  if (!canEditOwned(user, account.ownerId)) return fail("You can only manage your own invoices.", 403);

  if (!isS3Configured()) {
    return fail("File storage isn't configured. Set INVOICES_BUCKET (see serverless.yaml) to enable uploads.", 501);
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Attach a file under the 'file' field.");
  if (file.size === 0) return fail("The file is empty.");
  if (file.size > MAX_BYTES) return fail("File is too large (max 15 MB).");
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.has(type)) return fail("Only PDF, PNG or JPEG invoice files are allowed.");

  const key = invoiceKey(String(user.workspaceId), String(invoice._id));
  const bytes = Buffer.from(await file.arrayBuffer());
  await putObject(key, bytes, type);

  await Invoice.updateOne(
    { _id: invoice._id },
    { fileKey: key, fileName: file.name || `invoice-${invoice.number}.pdf`, fileType: type, fileSize: file.size, fileUploadedAt: new Date() },
  );
  const fresh = await Invoice.findById(invoice._id).lean<IInvoice>();
  return ok({ invoice: serializeInvoice(fresh!) }, 201);
});

/**
 * GET /api/invoices/:id/document — redirect to a short-lived presigned URL for
 * the stored invoice file.
 */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const { invoice } = await loadScoped(accountScope(user), id, user.workspaceId);

  if (!invoice.fileKey) return fail("No document has been uploaded for this invoice yet.", 404);
  if (!isS3Configured()) return fail("File storage isn't configured.", 501);

  const url = await presignGetUrl(invoice.fileKey, 300, invoice.fileName ?? `invoice-${invoice.number}.pdf`);
  return NextResponse.redirect(url, 302);
});

/** DELETE /api/invoices/:id/document — detach the stored file. */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const { invoice, account } = await loadScoped(accountScope(user), id, user.workspaceId);
  if (!canEditOwned(user, account.ownerId)) return fail("You can only manage your own invoices.", 403);

  await Invoice.updateOne(
    { _id: invoice._id },
    { $unset: { fileKey: "", fileName: "", fileType: "", fileSize: "", fileUploadedAt: "" } },
  );
  const fresh = await Invoice.findById(invoice._id).lean<IInvoice>();
  return ok({ invoice: serializeInvoice(fresh!) });
});
