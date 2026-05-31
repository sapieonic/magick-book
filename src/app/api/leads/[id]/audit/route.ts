import { type NextRequest } from "next/server";
import { ok, route, serializeAuditLog, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, AuditLog, type ILead, type IAuditLog } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/leads/:id/audit — change history for a single lead.
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;

  // Visible if live OR archived (so history works on archived leads too).
  const lead =
    (await Lead.findOne({ _id: id, ...leadScope(user) }).lean<ILead>()) ??
    (await Lead.findOne({ _id: id, ...leadScope(user, { archived: true }) }).lean<ILead>());
  if (!lead) throw new HttpError("Lead not found", 404);

  const entries = await AuditLog.find({ workspaceId: user.workspaceId, leadId: lead._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean<IAuditLog[]>();
  return ok({ entries: entries.map(serializeAuditLog) });
});
