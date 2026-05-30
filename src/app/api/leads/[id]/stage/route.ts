import { type NextRequest } from "next/server";
import { ok, fail, route, serializeLead, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, type ILead } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope, canEditOwned } from "@/lib/rbac";
import { logActivity } from "@/lib/services";
import { LEAD_STAGES, STAGE_META } from "@/lib/constants";
import { Types } from "mongoose";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/leads/:id/stage — move a lead between pipeline columns.
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const stage = b.stage;
  if (!LEAD_STAGES.includes(stage)) return fail("Invalid stage");

  const lead = await Lead.findOne({ _id: id, ...leadScope(user) }).lean<ILead>();
  if (!lead) throw new HttpError("Lead not found", 404);
  if (!canEditOwned(user, lead.ownerId)) return fail("You can only move your own leads.", 403);

  const patch: Record<string, unknown> = { stage, lastActivityAt: new Date() };
  if (typeof b.order === "number") patch.order = b.order;
  if (stage === "lost" && b.lostReason) patch.lostReason = String(b.lostReason).trim();

  await Lead.updateOne({ _id: lead._id }, patch);

  if (stage !== lead.stage) {
    await logActivity({
      workspaceId: user.workspaceId as unknown as Types.ObjectId,
      leadId: lead._id,
      actorId: user._id,
      kind: "stage_change",
      title: stage === "lost" ? "Marked lost" : STAGE_META[stage as keyof typeof STAGE_META].label,
      detail: stage === "lost" ? (b.lostReason ? String(b.lostReason) : undefined) : undefined,
    });
  }

  const fresh = await Lead.findById(lead._id).lean<ILead>();
  return ok({ lead: serializeLead(fresh!, user.name) });
});
