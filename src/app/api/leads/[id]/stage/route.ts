import { type NextRequest } from "next/server";
import { ok, fail, route, serializeLead } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, type ILead, type IUser } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope, canEditOwned } from "@/lib/rbac";
import { logActivity, audit, ownerNameMap, loadLead } from "@/lib/services";
import { notifyLeadLost, notifyLeadStageChanged } from "@/lib/slack";
import { LEAD_STAGES, STAGE_META, type LeadStage } from "@/lib/constants";
import { LANE_SORT } from "@/lib/leadFilters";
import { Types } from "mongoose";

type Ctx = { params: Promise<{ id: string }> };

/** Spacing between orders when a lane is renumbered, so later drops fit between neighbours. */
const LANE_GAP = 1024;

type Slot = { _id: Types.ObjectId; order: number };

/**
 * Where the moved lead goes in its lane: directly below `beforeId`, else
 * directly above `afterId`, else at the end. The neighbours are the cards
 * around the drop in the user's view, which search, filters and RBAC narrow,
 * so each must be in the user's scope and the lane (invalid ones are ignored),
 * and the slot is found in the whole workspace lane, so other owners' cards
 * keep their places. Returns the lead's new `order`, plus the writes that
 * renumber the lane when its neighbours leave no room (tied orders).
 * Undefined `order`: a same-lane PATCH with no usable neighbour; leave it be.
 */
async function placeInLane(user: IUser, lead: ILead, stage: LeadStage, beforeId: unknown, afterId: unknown) {
  const asked = [beforeId, afterId].filter((id): id is string => typeof id === "string" && Types.ObjectId.isValid(id));
  const valid = asked.length
    ? new Set((await Lead.find({ ...leadScope(user), stage, _id: { $in: asked, $ne: lead._id } }).distinct("_id")).map(String))
    : new Set<string>();
  if (valid.size === 0 && stage === lead.stage) return { order: undefined, renumber: [] };

  // The whole workspace lane, whoever owns each card: only `order` is read, nothing is returned.
  const lane = await Lead.find({ workspaceId: user.workspaceId, deletedAt: null, stage, _id: { $ne: lead._id } })
    .sort(LANE_SORT)
    .select("order")
    .lean<Slot[]>();
  const indexOf = (id: unknown) => (typeof id === "string" && valid.has(id) ? lane.findIndex((l) => String(l._id) === id) : -1);
  const below = indexOf(beforeId);
  const above = indexOf(afterId);
  const at = below >= 0 ? below + 1 : above >= 0 ? above : lane.length;

  const prev = lane[at - 1]?.order;
  const next = lane[at]?.order;
  if (prev === undefined) return { order: next === undefined ? 0 : next - LANE_GAP, renumber: [] };
  if (next === undefined) return { order: prev + LANE_GAP, renumber: [] };
  const mid = (prev + next) / 2;
  if (prev < mid && mid < next) return { order: mid, renumber: [] };

  // No room between them: respace the whole lane once, leaving slot `at` for the lead.
  const renumber = lane.map((l, i) => ({ updateOne: { filter: { _id: l._id }, update: { $set: { order: (i < at ? i : i + 1) * LANE_GAP } } } }));
  return { order: at * LANE_GAP, renumber };
}

// PATCH /api/leads/:id/stage — move a lead between pipeline columns.
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const stage = b.stage;
  if (!LEAD_STAGES.includes(stage)) return fail("Invalid stage");

  const lead = await loadLead(user, id, "write");
  if (!canEditOwned(user, lead.ownerId)) return fail("You can only move your own leads.", 403);

  const patch: Record<string, unknown> = { stage, lastActivityAt: new Date() };
  if (stage === "lost" && b.lostReason) patch.lostReason = String(b.lostReason).trim();

  // `beforeId` / `afterId`: the cards around the drop in the user's view. One write, unless the lane needs respacing.
  const { order, renumber } = await placeInLane(user, lead, stage, b.beforeId, b.afterId);
  if (order !== undefined) patch.order = order;
  await Lead.bulkWrite([...renumber, { updateOne: { filter: { _id: lead._id }, update: { $set: patch } } }]);

  if (stage !== lead.stage) {
    await logActivity({
      workspaceId: user.workspaceId as unknown as Types.ObjectId,
      leadId: lead._id,
      actorId: user._id,
      kind: "stage_change",
      title: stage === "lost" ? "Marked lost" : STAGE_META[stage as keyof typeof STAGE_META].label,
      detail: stage === "lost" ? (b.lostReason ? String(b.lostReason) : undefined) : undefined,
    });
    await audit({
      entity: "lead", entityId: lead._id, entityLabel: lead.name, action: "update", actor: user,
      changes: [{ field: "stage", from: lead.stage, to: stage }], leadId: lead._id,
    });

    // Notify Slack: a lost lead reads differently from a routine lane move.
    const slackBase = { leadId: String(lead._id), leadName: lead.name, company: lead.company, actorName: user.name };
    if (stage === "lost") {
      await notifyLeadLost({ ...slackBase, fromStage: lead.stage, lostReason: typeof b.lostReason === "string" ? b.lostReason.trim() || undefined : undefined, estValue: lead.estValue });
    } else {
      await notifyLeadStageChanged({ ...slackBase, fromStage: lead.stage, toStage: stage });
    }
  }

  const fresh = await Lead.findById(lead._id).lean<ILead>();
  const names = await ownerNameMap([fresh!.ownerId]);
  return ok({ lead: serializeLead(fresh!, names.get(String(fresh!.ownerId)) ?? "") });
});
