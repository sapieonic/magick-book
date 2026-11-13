import { type NextRequest, NextResponse } from "next/server";
import { ok, fail, route, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Document, type IAccount, type IDocument, type IUser } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { canEditOwned } from "@/lib/rbac";
import { audit, loadAccount } from "@/lib/services";
import { isS3Configured, presignGetUrl } from "@/lib/s3";

type Ctx = { params: Promise<{ id: string; docId: string }> };

async function loadScoped(user: IUser, accountId: string, docId: string, access: "read" | "write"): Promise<{ account: IAccount; doc: IDocument }> {
  const account = await loadAccount(user, accountId, access);
  const doc = await Document.findOne({ _id: docId, accountId: account._id, deletedAt: null }).lean<IDocument>();
  if (!doc) throw new HttpError("Document not found", 404);
  return { account, doc };
}

// GET /api/accounts/:id/documents/:docId — redirect to a short-lived presigned URL (archived accounts too).
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id, docId } = await ctx.params;
  const { doc } = await loadScoped(user, id, docId, "read");

  if (!isS3Configured()) return fail("File storage isn't configured.", 501);
  const url = await presignGetUrl(doc.fileKey, 300, doc.fileName);
  return NextResponse.redirect(url, 302);
});

// DELETE /api/accounts/:id/documents/:docId — soft-delete (archive) the document.
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id, docId } = await ctx.params;
  const { account, doc } = await loadScoped(user, id, docId, "write");
  if (!canEditOwned(user, account.ownerId)) return fail("You can only manage documents on your own accounts.", 403);

  await Document.updateOne({ _id: doc._id }, { deletedAt: new Date(), deletedBy: user._id });
  await Account.updateOne({ _id: account._id }, { lastActivityAt: new Date() });
  await audit({ entity: "document", entityId: doc._id, entityLabel: doc.title, action: "delete", actor: user, accountId: account._id });
  return ok({ ok: true });
});
