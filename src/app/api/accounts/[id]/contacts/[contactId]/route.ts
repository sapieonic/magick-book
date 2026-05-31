import { type NextRequest } from "next/server";
import { ok, fail, route, serializeContact, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Contact, type IAccount, type IContact } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";
import { audit, diffChanges } from "@/lib/services";

type Ctx = { params: Promise<{ id: string; contactId: string }> };

async function loadOwnedAccount(scope: Record<string, unknown>, id: string): Promise<IAccount> {
  const acc = await Account.findOne({ _id: id, ...scope }).lean<IAccount>();
  if (!acc) throw new HttpError("Account not found", 404);
  return acc;
}

async function loadContact(accountId: string, contactId: string): Promise<IContact> {
  const c = await Contact.findOne({ _id: contactId, accountId, deletedAt: null }).lean<IContact>();
  if (!c) throw new HttpError("Contact not found", 404);
  return c;
}

// PATCH /api/accounts/:id/contacts/:contactId — edit a contact's details.
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id, contactId } = await ctx.params;
  const acc = await loadOwnedAccount(accountScope(user), id);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only edit your own accounts.", 403);
  const before = await loadContact(id, contactId);

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof b.name === "string") {
    if (!b.name.trim()) return fail("Contact name is required");
    patch.name = b.name.trim();
  }
  for (const f of ["title", "email", "phone"] as const) {
    if (typeof b[f] === "string") patch[f] = b[f].trim();
  }

  const changes = diffChanges(before as unknown as Record<string, unknown>, patch, ["name", "title", "email", "phone"]);

  // Promoting this contact to primary: clear the flag on the others and repoint the account.
  if (b.isPrimary === true && !before.isPrimary) {
    await Contact.updateMany({ accountId: acc._id, _id: { $ne: contactId } }, { isPrimary: false });
    patch.isPrimary = true;
    changes.push({ field: "isPrimary", from: false, to: true });
  }

  await Contact.updateOne({ _id: contactId }, patch);
  if (patch.isPrimary === true) {
    await Account.updateOne({ _id: acc._id }, { primaryContactId: contactId, lastActivityAt: new Date() });
  } else {
    await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  }

  await audit({ entity: "contact", entityId: contactId, entityLabel: (patch.name as string) ?? before.name, action: "update", actor: user, changes, accountId: acc._id });
  const fresh = await Contact.findById(contactId).lean<IContact>();
  return ok({ contact: serializeContact(fresh!) });
});

// DELETE /api/accounts/:id/contacts/:contactId — soft-delete (archive) a contact.
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id, contactId } = await ctx.params;
  const acc = await loadOwnedAccount(accountScope(user), id);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only edit your own accounts.", 403);
  const contact = await loadContact(id, contactId);

  await Contact.updateOne({ _id: contactId }, { deletedAt: new Date(), deletedBy: user._id, isPrimary: false });

  // If we just archived the primary contact, promote the next LIVE one (if any).
  if (String(acc.primaryContactId) === String(contactId)) {
    const next = await Contact.findOne({ accountId: acc._id, deletedAt: null }).sort({ isPrimary: -1, createdAt: 1 }).lean<IContact>();
    if (next) {
      await Contact.updateOne({ _id: next._id }, { isPrimary: true });
      await Account.updateOne({ _id: acc._id }, { primaryContactId: next._id, lastActivityAt: new Date() });
    } else {
      await Account.updateOne({ _id: acc._id }, { $unset: { primaryContactId: "" }, lastActivityAt: new Date() });
    }
  } else {
    await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  }

  await audit({ entity: "contact", entityId: contactId, entityLabel: contact.name, action: "delete", actor: user, accountId: acc._id });
  return ok({ ok: true });
});
