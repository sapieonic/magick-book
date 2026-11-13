import { ok, route } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, Account, Invoice, type IAccount } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope, accountScope } from "@/lib/rbac";
import { OPEN_LEAD_STAGES } from "@/lib/constants";
import { OUTSTANDING_STATUSES } from "@/lib/receivables";
import type { NavSummary } from "@/lib/types";

/** The working funnel: on the pipeline but not yet won (matches the dashboard's "open leads"). */
const RECENT_ACCOUNTS = 3;

// GET /api/nav — the sidebar's live counts, scoped to what the user can see.
export const GET = route(async () => {
  const user = await requireUser();
  await connectDB();
  const scope = accountScope(user);

  const [openLeads, accounts, recent, [due]] = await Promise.all([
    Lead.countDocuments({ ...leadScope(user), stage: { $in: OPEN_LEAD_STAGES } }),
    Account.countDocuments(scope),
    Account.find(scope).sort({ lastActivityAt: -1 }).limit(RECENT_ACCOUNTS).select("name").lean<Pick<IAccount, "_id" | "name">[]>(),
    // Unpaid live invoices whose account the user can see (live, and theirs unless admin).
    Invoice.aggregate<{ total: number }>([
      { $match: { workspaceId: user.workspaceId, deletedAt: null, status: { $in: OUTSTANDING_STATUSES } } },
      {
        $lookup: {
          from: Account.collection.collectionName,
          localField: "accountId",
          foreignField: "_id",
          pipeline: [{ $match: scope }, { $project: { _id: 1 } }],
          as: "account",
        },
      },
      { $match: { "account.0": { $exists: true } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  const data: NavSummary = {
    openLeads,
    accounts,
    moneyDue: due?.total ?? 0,
    recentAccounts: recent.map((a) => ({ id: String(a._id), name: a.name })),
  };
  return ok(data);
});
