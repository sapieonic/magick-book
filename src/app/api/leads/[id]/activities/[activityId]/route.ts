import { type NextRequest } from "next/server";
import { ok, fail, route, serializeActivity, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, Activity, type ILead, type IActivity } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string; activityId: string }> };

// PATCH /api/leads/:id/activities/:activityId — edit a note you authored.
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id, activityId } = await ctx.params;

  const lead = await Lead.findOne({ _id: id, ...leadScope(user) }).lean<ILead>();
  if (!lead) throw new HttpError("Lead not found", 404);

  const activity = await Activity.findOne({ _id: activityId, leadId: lead._id }).lean<IActivity>();
  if (!activity) throw new HttpError("Note not found", 404);

  // Only free-form notes are editable; system-generated entries are immutable history.
  if (activity.kind !== "note") return fail("Only notes can be edited.", 400);
  // A note can only be edited by the person who wrote it.
  if (String(activity.actorId) !== String(user._id)) return fail("You can only edit your own notes.", 403);

  const b = await req.json().catch(() => ({}));
  const detail = typeof b.detail === "string" ? b.detail.trim() : "";
  if (!detail) return fail("Note can't be empty.");

  const editedAt = new Date();
  await Activity.updateOne({ _id: activity._id }, { detail, editedAt });

  return ok({ activity: serializeActivity({ ...activity, detail, editedAt }, user.name) });
});
