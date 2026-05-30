import { type NextRequest } from "next/server";
import { ok, fail, route, serializeAccount } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Contact, type IAccount, type IContact } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope } from "@/lib/rbac";
import { ownerNameMap } from "@/lib/services";
import { ACCOUNT_STATUSES } from "@/lib/constants";
import { Types } from "mongoose";

// GET /api/accounts — list with primary contact + contact counts.
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  await connectDB();
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const q = sp.get("q")?.trim();

  const filter: Record<string, unknown> = accountScope(user);
  if (status && ACCOUNT_STATUSES.includes(status as never)) filter.status = status;
  if (q) filter.name = { $regex: q, $options: "i" };

  const accounts = await Account.find(filter).sort({ lastActivityAt: -1 }).lean<IAccount[]>();
  const accIds = accounts.map((a) => a._id);
  const primaryIds = accounts
    .map((a) => a.primaryContactId)
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const [primaryContacts, counts, names] = await Promise.all([
    Contact.find({ _id: { $in: primaryIds } }).lean<IContact[]>(),
    Contact.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { accountId: { $in: accIds } } },
      { $group: { _id: "$accountId", n: { $sum: 1 } } },
    ]),
    ownerNameMap(accounts.map((a) => a.ownerId)),
  ]);

  const pcMap = new Map(primaryContacts.map((c) => [String(c._id), c]));
  const countMap = new Map(counts.map((c) => [String(c._id), c.n]));

  // Tab counts for the filter chips (always over the full visible set).
  const allForCounts = status ? await Account.find(accountScope(user)).select("status").lean<{ status: string }[]>() : accounts;
  const tabCounts = {
    all: allForCounts.length,
    active: allForCounts.filter((a) => a.status === "active").length,
    at_risk: allForCounts.filter((a) => a.status === "at_risk").length,
    churned: allForCounts.filter((a) => a.status === "churned").length,
  };

  return ok({
    accounts: accounts.map((a) =>
      serializeAccount(a, {
        ownerName: names.get(String(a.ownerId)) ?? "",
        primaryContact: a.primaryContactId ? pcMap.get(String(a.primaryContactId)) ?? null : null,
        contactCount: countMap.get(String(a._id)) ?? 0,
      }),
    ),
    tabCounts,
  });
});

// POST /api/accounts — create an account directly (with optional primary contact).
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  await connectDB();
  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return fail("Account name is required");

  const accId = new Types.ObjectId();
  let primaryContactId: Types.ObjectId | undefined;
  if (b.contactName?.trim()) {
    const c = await Contact.create({
      workspaceId: user.workspaceId,
      accountId: accId,
      name: b.contactName.trim(),
      title: b.contactTitle?.trim(),
      email: b.contactEmail?.trim(),
      phone: b.contactPhone?.trim(),
      isPrimary: true,
    });
    primaryContactId = c._id;
  }

  const account = await Account.create({
    _id: accId,
    workspaceId: user.workspaceId,
    ownerId: user._id,
    name: b.name.trim(),
    domain: b.domain?.trim(),
    industry: b.industry?.trim(),
    status: ACCOUNT_STATUSES.includes(b.status) ? b.status : "active",
    plan: b.plan?.trim(),
    value: Number(b.value) || 0,
    customerSince: new Date(),
    primaryContactId,
    lastActivityAt: new Date(),
  });

  const primary = primaryContactId ? await Contact.findById(primaryContactId).lean<IContact>() : null;
  return ok(
    { account: serializeAccount(account.toObject(), { ownerName: user.name, primaryContact: primary, contactCount: primary ? 1 : 0 }) },
    201,
  );
});
