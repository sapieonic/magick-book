import { type NextRequest } from "next/server";
import { ok, fail, route, serializeContact } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Contact, type IContact } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { canEditOwned } from "@/lib/rbac";
import { audit, loadAccount } from "@/lib/services";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/accounts/:id/contacts — primary first (archived accounts too).
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await loadAccount(user, id, "read");
  const contacts = await Contact.find({ accountId: acc._id, deletedAt: null }).sort({ isPrimary: -1, createdAt: 1 }).lean<IContact[]>();
  return ok({ contacts: contacts.map(serializeContact) });
});

// POST /api/accounts/:id/contacts — add a contact to a live account.
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await loadAccount(user, id, "write");
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only edit your own accounts.", 403);

  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return fail("Contact name is required");
  const c = await Contact.create({
    workspaceId: user.workspaceId,
    accountId: acc._id,
    name: b.name.trim(),
    title: b.title?.trim(),
    email: b.email?.trim(),
    phone: b.phone?.trim(),
    isPrimary: false,
  });
  await Account.updateOne({ _id: acc._id }, { lastActivityAt: new Date() });
  await audit({ entity: "contact", entityId: c._id, entityLabel: c.name, action: "create", actor: user, accountId: acc._id });
  return ok({ contact: serializeContact(c.toObject()) }, 201);
});
