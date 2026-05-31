import { type NextRequest } from "next/server";
import { ok, route, serializeAuditLog, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, AuditLog, type IAccount, type IAuditLog } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/accounts/:id/audit — change history for an account and its children
// (contacts, invoices, expenses, documents) — anything tagged with this accountId.
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;

  const account =
    (await Account.findOne({ _id: id, ...accountScope(user) }).lean<IAccount>()) ??
    (await Account.findOne({ _id: id, ...accountScope(user, { archived: true }) }).lean<IAccount>());
  if (!account) throw new HttpError("Account not found", 404);

  const entries = await AuditLog.find({ workspaceId: user.workspaceId, accountId: account._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean<IAuditLog[]>();
  return ok({ entries: entries.map(serializeAuditLog) });
});
