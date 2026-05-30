import { type NextRequest } from "next/server";
import { ok, route, serializeActivity, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Account, Activity, type IAccount, type IActivity } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { accountScope } from "@/lib/rbac";
import { ownerNameMap } from "@/lib/services";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const acc = await Account.findOne({ _id: id, ...accountScope(user) }).lean<IAccount>();
  if (!acc) throw new HttpError("Account not found", 404);

  const activities = await Activity.find({ accountId: acc._id }).sort({ createdAt: -1 }).lean<IActivity[]>();
  const names = await ownerNameMap(activities.map((a) => a.actorId).filter(Boolean) as never[]);
  return ok({ activities: activities.map((a) => serializeActivity(a, names.get(String(a.actorId)) ?? "")) });
});
