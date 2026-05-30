import { type NextRequest } from "next/server";
import { ok, fail, route, serializeAccount, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Contact, Invoice, Expense, Activity, type IAccount, type IContact } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope, canEditOwned } from "@/lib/rbac";
import { accountFinance, ownerNameMap } from "@/lib/services";
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
    Contact.countDocuments({ accountId: acc._id }),
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

// PATCH /api/accounts/:id
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await load(accountScope(user), id);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only edit your own accounts.", 403);

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const f of ["name", "domain", "industry", "plan"] as const) {
    if (typeof b[f] === "string") patch[f] = b[f].trim();
  }
  if (b.status && ACCOUNT_STATUSES.includes(b.status)) patch.status = b.status;
  if (b.value !== undefined) patch.value = Number(b.value) || 0;
  patch.lastActivityAt = new Date();

  await Account.updateOne({ _id: acc._id }, patch);
  const fresh = await Account.findById(acc._id).lean<IAccount>();
  return ok({ account: serializeAccount(fresh!, { ownerName: user.name }) });
});

// DELETE /api/accounts/:id — removes the account and its children.
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await load(accountScope(user), id);
  if (!canEditOwned(user, acc.ownerId)) return fail("You can only delete your own accounts.", 403);
  await Promise.all([
    Account.deleteOne({ _id: acc._id }),
    Contact.deleteMany({ accountId: acc._id }),
    Invoice.deleteMany({ accountId: acc._id }),
    Expense.deleteMany({ accountId: acc._id }),
    Activity.deleteMany({ accountId: acc._id }),
  ]);
  return ok({ ok: true });
});
