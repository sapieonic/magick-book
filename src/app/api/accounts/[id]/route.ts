import { type NextRequest } from "next/server";
import { ok, fail, route, serializeAccount, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Contact, type IAccount, type IContact } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { canEditOwned } from "@/lib/rbac";
import { accountFinance, ownerNameMap, audit, diffChanges, loadAccount } from "@/lib/services";
import { ACCOUNT_STATUSES } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

/** Re-read an account after a write, named for its owner (not the editor, who may be an admin). */
async function freshAccount(id: IAccount["_id"]) {
  const acc = (await Account.findById(id).lean<IAccount>())!;
  const names = await ownerNameMap([acc.ownerId]);
  return serializeAccount(acc, { ownerName: names.get(String(acc.ownerId)) ?? "" });
}

// GET /api/accounts/:id — account + finance summary. An archived account still
// resolves (with `deletedAt` set) so its page can offer Restore.
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await loadAccount(user, id, "read");

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

  // Restore resolves archived accounts too, and only acts on one that is archived.
  if (b.action === "restore") {
    const acc = await loadAccount(user, id, "read");
    if (!acc.deletedAt) throw new HttpError("Account not found", 404);
    if (!canEditOwned(user, acc.ownerId)) return fail("You can only restore your own accounts.", 403);
    await Account.updateOne({ _id: acc._id }, { $unset: { deletedAt: "", deletedBy: "" } });
    await audit({ entity: "account", entityId: acc._id, entityLabel: acc.name, action: "restore", actor: user, accountId: acc._id });
    return ok({ account: await freshAccount(acc._id) });
  }

  const acc = await loadAccount(user, id, "write");
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
  return ok({ account: await freshAccount(acc._id) });
});

// DELETE /api/accounts/:id — soft-delete (archive). Children stay put: readable
// through the archived account, editable again once it is restored.
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await loadAccount(user, id, "write");
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only delete your own accounts.", 403);
  await Account.updateOne({ _id: acc._id }, { deletedAt: new Date(), deletedBy: user._id });
  await audit({ entity: "account", entityId: acc._id, entityLabel: acc.name, action: "delete", actor: user, accountId: acc._id });
  return ok({ ok: true });
});
