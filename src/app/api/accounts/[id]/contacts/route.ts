import { type NextRequest } from "next/server";
import { ok, fail, route, serializeContact, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Contact, type IAccount, type IContact } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

async function requireAccount(scope: Record<string, unknown>, id: string): Promise<IAccount> {
  const acc = await Account.findOne({ _id: id, ...scope }).lean<IAccount>();
  if (!acc) throw new HttpError("Account not found", 404);
  return acc;
}

export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  await requireAccount(accountScope(user), id);
  const contacts = await Contact.find({ accountId: id }).sort({ isPrimary: -1, createdAt: 1 }).lean<IContact[]>();
  return ok({ contacts: contacts.map(serializeContact) });
});

export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await requireAccount(accountScope(user), id);
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
  return ok({ contact: serializeContact(c.toObject()) }, 201);
});
