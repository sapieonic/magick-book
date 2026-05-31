import { type NextRequest } from "next/server";
import { Types } from "mongoose";
import { ok, fail, route, serializeDocument, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Document, type IAccount, type IDocument } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";
import { audit, ownerNameMap } from "@/lib/services";
import { isS3Configured, putObject, documentKey } from "@/lib/s3";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

async function requireAccount(scope: Record<string, unknown>, id: string): Promise<IAccount> {
  const acc = await Account.findOne({ _id: id, ...scope }).lean<IAccount>();
  if (!acc) throw new HttpError("Account not found", 404);
  return acc;
}

// GET /api/accounts/:id/documents — proposals/agreements attached to the account.
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  await requireAccount(accountScope(user), id);

  const docs = await Document.find({ accountId: id, deletedAt: null }).sort({ createdAt: -1 }).lean<IDocument[]>();
  const names = await ownerNameMap(docs.map((d) => d.uploadedById).filter(Boolean) as Types.ObjectId[]);
  return ok({ documents: docs.map((d) => serializeDocument(d, names.get(String(d.uploadedById)) ?? "")) });
});

// POST /api/accounts/:id/documents — upload a proposal/agreement to S3 (multipart:
// "file" + optional "kind" and "title").
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await requireAccount(accountScope(user), id);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only manage documents on your own accounts.", 403);

  if (!isS3Configured()) {
    return fail("File storage isn't configured. Set INVOICES_BUCKET (see serverless.yaml) to enable uploads.", 501);
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Attach a file under the 'file' field.");
  if (file.size === 0) return fail("The file is empty.");
  if (file.size > MAX_BYTES) return fail("File is too large (max 25 MB).");
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.has(type)) return fail("Only PDF, Word, PNG or JPEG documents are allowed.");

  const kindRaw = String(form?.get("kind") ?? "other");
  const kind: DocumentKind = (DOCUMENT_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as DocumentKind) : "other";
  const title = String(form?.get("title") ?? "").trim() || file.name || "Document";

  const docId = new Types.ObjectId();
  const key = documentKey(String(user.workspaceId), String(docId));
  const bytes = Buffer.from(await file.arrayBuffer());
  await putObject(key, bytes, type);

  const doc = await Document.create({
    _id: docId,
    workspaceId: user.workspaceId,
    accountId: acc._id,
    kind,
    title,
    fileKey: key,
    fileName: file.name || `${title}.pdf`,
    fileType: type,
    fileSize: file.size,
    uploadedById: user._id,
  });
  await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  await audit({ entity: "document", entityId: doc._id, entityLabel: title, action: "create", actor: user, accountId: acc._id, changes: [{ field: "kind", to: kind }] });

  return ok({ document: serializeDocument(doc.toObject(), user.name) }, 201);
});
