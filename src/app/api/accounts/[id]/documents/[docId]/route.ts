import { type NextRequest, NextResponse } from "next/server";
import { ok, fail, route, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Document, type IAccount, type IDocument } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";
import { audit } from "@/lib/services";
import { isS3Configured, presignGetUrl } from "@/lib/s3";

type Ctx = { params: Promise<{ id: string; docId: string }> };

async function loadScoped(scope: Record<string, unknown>, accountId: string, docId: string): Promise<{ account: IAccount; doc: IDocument }> {
  const account = await Account.findOne({ _id: accountId, ...scope }).lean<IAccount>();
  if (!account) throw new HttpError("Account not found", 404);
  const doc = await Document.findOne({ _id: docId, accountId, deletedAt: null }).lean<IDocument>();
  if (!doc) throw new HttpError("Document not found", 404);
  return { account, doc };
}

// GET /api/accounts/:id/documents/:docId — redirect to a short-lived presigned URL.
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id, docId } = await ctx.params;
  const { doc } = await loadScoped(accountScope(user), id, docId);

  if (!isS3Configured()) return fail("File storage isn't configured.", 501);
  const url = await presignGetUrl(doc.fileKey, 300, doc.fileName);
  return NextResponse.redirect(url, 302);
});

// DELETE /api/accounts/:id/documents/:docId — soft-delete (archive) the document.
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id, docId } = await ctx.params;
  const { account, doc } = await loadScoped(accountScope(user), id, docId);
  if (!canEditOwned(user, account.ownerId)) return fail("You can only manage documents on your own accounts.", 403);

  await Document.updateOne({ _id: doc._id }, { deletedAt: new Date(), deletedBy: user._id });
  await Account.updateOne({ _id: account._id }, { lastActivityAt: new Date() });
  await audit({ entity: "document", entityId: doc._id, entityLabel: doc.title, action: "delete", actor: user, accountId: account._id });
  return ok({ ok: true });
});
