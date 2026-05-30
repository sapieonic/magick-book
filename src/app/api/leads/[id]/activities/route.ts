import { type NextRequest } from "next/server";
import { ok, fail, route, serializeActivity, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, Activity, type ILead, type IActivity } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope } from "@/lib/rbac";
import { CONTACT_METHODS, ACTIVITY_KINDS } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

const METHOD_TITLE: Record<string, string> = {
  call: "Call logged",
  whatsapp: "WhatsApp sent",
  email: "Email sent",
  sms: "SMS sent",
  note: "Note added",
};

// POST /api/leads/:id/activities — log a reach-out or note on the timeline.
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const lead = await Lead.findOne({ _id: id, ...leadScope(user) }).lean<ILead>();
  if (!lead) throw new HttpError("Lead not found", 404);

  const b = await req.json().catch(() => ({}));
  const kind = b.kind;
  const valid = [...CONTACT_METHODS, "note"];
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

  return ok({ activity: serializeActivity(created.toObject(), user.name) }, 201);
});
