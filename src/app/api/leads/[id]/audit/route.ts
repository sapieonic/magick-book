import { type NextRequest } from "next/server";
import { ok, route, serializeAuditLog } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { AuditLog, type IAuditLog } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { loadLead } from "@/lib/services";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/leads/:id/audit — change history for a single lead.
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;

  // Archived leads too, so history works on them.
  const lead = await loadLead(user, id, "read");

  const entries = await AuditLog.find({ workspaceId: user.workspaceId, leadId: lead._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean<IAuditLog[]>();
  return ok({ entries: entries.map(serializeAuditLog) });
});
