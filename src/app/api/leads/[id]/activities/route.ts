import { type NextRequest } from "next/server";
import { ok, fail, route, serializeActivity } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, Activity, type IActivity } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { loadLead } from "@/lib/services";
import { notifyLeadComment } from "@/lib/slack";
import { CONTACT_METHODS, ACTIVITY_KINDS, MEETING_TITLE } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

const METHOD_TITLE: Record<string, string> = {
  call: "Call logged",
  whatsapp: "WhatsApp sent",
  email: "Email sent",
  sms: "SMS sent",
  note: "Note added",
  meeting: MEETING_TITLE,
};

// POST /api/leads/:id/activities — log a reach-out, meeting or note on the timeline.
// A meeting has no activity kind of its own: it is stored as a note titled MEETING_TITLE.
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const lead = await loadLead(user, id, "write");

  const b = await req.json().catch(() => ({}));
  const kind = b.kind;
  const valid = [...CONTACT_METHODS, "note", "meeting"];
  if (!valid.includes(kind)) return fail("Invalid activity kind");

  const activityKind = (ACTIVITY_KINDS.includes(kind) ? kind : "note") as IActivity["kind"];
  const created = await Activity.create({
    workspaceId: user.workspaceId,
    leadId: lead._id,
    actorId: user._id,
    kind: activityKind,
    title: METHOD_TITLE[kind] ?? "Activity",
    detail: b.detail?.trim(),
  });
  await Lead.updateOne({ _id: lead._id }, { lastActivityAt: new Date() });

  await notifyLeadComment({
    leadId: String(lead._id),
    leadName: lead.name,
    company: lead.company,
    title: METHOD_TITLE[kind] ?? "Activity",
    detail: b.detail?.trim(),
    actorName: user.name,
  });

  return ok({ activity: serializeActivity(created.toObject(), user.name) }, 201);
});
