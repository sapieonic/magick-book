import { type NextRequest } from "next/server";
import { ok, fail, route, serializeAccount, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, Account, Contact, Activity, User, type ILead } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope, canEditOwned } from "@/lib/rbac";
import { logActivity, audit } from "@/lib/services";
import { Types } from "mongoose";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/leads/:id/convert — turn a won lead into an active account.
 * Mirrors the wireframe: the lead contact becomes the account's primary
 * contact, the company becomes the account, and the lead's activity history is
 * carried over to the new account.
 */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;

  const lead = await Lead.findOne({ _id: id, ...leadScope(user) }).lean<ILead>();
  if (!lead) throw new HttpError("Lead not found", 404);
  if (!canEditOwned(user, lead.ownerId)) return fail("You can only convert your own leads.", 403);
  if (lead.convertedAccountId) return fail("This lead is already an account.", 409);

  const b = await req.json().catch(() => ({}));
  const accountName = (b.accountName || lead.company || lead.name).trim();
  const ownerId = b.ownerId && (await User.exists({ _id: b.ownerId, workspaceId: user.workspaceId })) ? b.ownerId : lead.ownerId;
  const plan = b.plan?.trim() || undefined;

  const accId = new Types.ObjectId();

  // Lead contact → primary contact.
  const primary = await Contact.create({
    workspaceId: user.workspaceId,
    accountId: accId,
    name: lead.name,
    title: lead.title,
    email: lead.email,
    phone: lead.phone,
    isPrimary: true,
    note: "the original lead",
  });

  const account = await Account.create({
    _id: accId,
    workspaceId: user.workspaceId,
    ownerId,
    name: accountName,
    status: "active",
    plan,
    value: lead.estValue ?? 0,
    customerSince: new Date(),
    primaryContactId: primary._id,
    fromLeadId: lead._id,
    lastActivityAt: new Date(),
  });

  // Carry the lead's history onto the account, and mark the lead won+converted.
  await Activity.updateMany({ leadId: lead._id }, { $set: { accountId: accId } });
  await Lead.updateOne({ _id: lead._id }, { stage: "won", convertedAccountId: accId, lastActivityAt: new Date() });
  await logActivity({
    workspaceId: user.workspaceId as unknown as Types.ObjectId,
    accountId: accId,
    leadId: lead._id,
    actorId: user._id,
    kind: "converted",
    title: "Converted from lead",
    detail: `${lead.name} set as primary contact`,
  });
  await audit({ entity: "account", entityId: accId, entityLabel: accountName, action: "create", actor: user, accountId: accId, changes: [{ field: "fromLead", to: lead.name }] });
  await audit({ entity: "lead", entityId: lead._id, entityLabel: lead.name, action: "update", actor: user, changes: [{ field: "stage", from: lead.stage, to: "won" }, { field: "convertedAccount", to: accountName }], leadId: lead._id, accountId: accId });

  return ok(
    { account: serializeAccount(account.toObject(), { ownerName: user.name, primaryContact: primary.toObject(), contactCount: 1 }) },
    201,
  );
});
