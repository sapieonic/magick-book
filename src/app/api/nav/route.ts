import { ok, route } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, Account, Invoice, type IAccount } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope, accountScope } from "@/lib/rbac";
import { PIPELINE_STAGES } from "@/lib/constants";
import type { NavSummary } from "@/lib/types";

/** The working funnel: on the pipeline but not yet won (matches the dashboard's "open leads"). */
const OPEN_STAGES = PIPELINE_STAGES.filter((s) => s !== "won");
const RECENT_ACCOUNTS = 3;

// GET /api/nav — the sidebar's live counts, scoped to what the user can see.
export const GET = route(async () => {
  const user = await requireUser();
  await connectDB();

  const [openLeads, accounts] = await Promise.all([
    Lead.countDocuments({ ...leadScope(user), stage: { $in: OPEN_STAGES } }),
    Account.find(accountScope(user)).sort({ lastActivityAt: -1 }).select("name").lean<Pick<IAccount, "_id" | "name">[]>(),
  ]);

  const [due] = await Invoice.aggregate<{ total: number }>([
    { $match: { accountId: { $in: accounts.map((a) => a._id) }, deletedAt: null, status: { $in: ["sent", "overdue"] } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  const data: NavSummary = {
    openLeads,
    accounts: accounts.length,
    moneyDue: due?.total ?? 0,
    recentAccounts: accounts.slice(0, RECENT_ACCOUNTS).map((a) => ({ id: String(a._id), name: a.name })),
  };
  return ok(data);
});
