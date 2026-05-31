import { type NextRequest } from "next/server";
import { ok, fail, route, serializeAccount, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Contact, type IAccount, type IContact } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";
import { accountFinance, ownerNameMap, audit, diffChanges } from "@/lib/services";
import { ACCOUNT_STATUSES } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

async function load(scope: Record<string, unknown>, id: string) {
  const acc = await Account.findOne({ _id: id, ...scope }).lean<IAccount>();
  if (!acc) throw new HttpError("Account not found", 404);
  return acc;
}

// GET /api/accounts/:id — account + finance summary.
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await load(accountScope(user), id);

  const [finance, primary, contactCount, names] = await Promise.all([
    accountFinance(acc._id),
    acc.primaryContactId ? Contact.findById(acc.primaryContactId).lean<IContact>() : Promise.resolve(null),
    Contact.countDocuments({ accountId: acc._id, deletedAt: null }),
    ownerNameMap([acc.ownerId]),
  ]);

  return ok({
    account: serializeAccount(acc, {
      ownerName: names.get(String(acc.ownerId)) ?? "",
      primaryContact: primary,
      contactCount,
    }),
    finance,
  });
});

// PATCH /api/accounts/:id — edit fields, or restore an archived account (action: "restore").
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));

  // Restore path loads from the ARCHIVED scope (the live scope hides it).
  if (b.action === "restore") {
    const acc = await load(accountScope(user, { archived: true }), id);
    if (!canEditOwned(user, acc.ownerId)) return fail("You can only restore your own accounts.", 403);
    await Account.updateOne({ _id: acc._id }, { $unset: { deletedAt: "", deletedBy: "" } });
    await audit({ entity: "account", entityId: acc._id, entityLabel: acc.name, action: "restore", actor: user, accountId: acc._id });
    const fresh = await Account.findById(acc._id).lean<IAccount>();
    return ok({ account: serializeAccount(fresh!, { ownerName: user.name }) });
  }

  const acc = await load(accountScope(user), id);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only edit your own accounts.", 403);

  const patch: Record<string, unknown> = {};
  for (const f of ["name", "domain", "industry", "plan"] as const) {
    if (typeof b[f] === "string") patch[f] = b[f].trim();
  }
  if (b.status && ACCOUNT_STATUSES.includes(b.status)) patch.status = b.status;
  if (b.value !== undefined) patch.value = Number(b.value) || 0;

  const changes = diffChanges(acc as unknown as Record<string, unknown>, patch, ["name", "domain", "industry", "plan", "status", "value"]);
  patch.lastActivityAt = new Date();

  await Account.updateOne({ _id: acc._id }, patch);
  await audit({ entity: "account", entityId: acc._id, entityLabel: (patch.name as string) ?? acc.name, action: "update", actor: user, changes, accountId: acc._id });
  const fresh = await Account.findById(acc._id).lean<IAccount>();
  return ok({ account: serializeAccount(fresh!, { ownerName: user.name }) });
});

// DELETE /api/accounts/:id — soft-delete (archive). Children stay put but become
// unreachable through the archived account, and reappear on restore.
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await load(accountScope(user), id);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only delete your own accounts.", 403);
  await Account.updateOne({ _id: acc._id }, { deletedAt: new Date(), deletedBy: user._id });
  await audit({ entity: "account", entityId: acc._id, entityLabel: acc.name, action: "delete", actor: user, accountId: acc._id });
  return ok({ ok: true });
});
