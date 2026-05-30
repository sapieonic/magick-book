import { type NextRequest } from "next/server";
import { ok, fail, route, serializeLead, serializeActivity, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, Activity, type ILead, type IActivity } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope, canEditOwned } from "@/lib/rbac";
import { ownerNameMap } from "@/lib/services";
import { LEAD_SOURCES, LEAD_STAGES } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

async function loadLead(userScope: Record<string, unknown>, id: string) {
  const lead = await Lead.findOne({ _id: id, ...userScope }).lean<ILead>();
  if (!lead) throw new HttpError("Lead not found", 404);
  return lead;
}

// GET /api/leads/:id — lead + activity timeline.
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const lead = await loadLead(leadScope(user), id);

  const [names, activities] = await Promise.all([
    ownerNameMap([lead.ownerId]),
    Activity.find({ leadId: lead._id }).sort({ createdAt: -1 }).lean<IActivity[]>(),
  ]);
  const actorNames = await ownerNameMap(activities.map((a) => a.actorId).filter(Boolean) as never[]);

  return ok({
    lead: serializeLead(lead, names.get(String(lead.ownerId)) ?? ""),
    activities: activities.map((a) => serializeActivity(a, actorNames.get(String(a.actorId)) ?? "")),
  });
});

// PATCH /api/leads/:id — edit lead fields.
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const lead = await loadLead(leadScope(user), id);
  if (!canEditOwned(user, lead.ownerId)) return fail("You can only edit your own leads.", 403);

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const f of ["name", "company", "title", "phone", "email", "notes"] as const) {
    if (typeof b[f] === "string") patch[f] = b[f].trim();
  }
  if (b.source && LEAD_SOURCES.includes(b.source)) patch.source = b.source;
  if (b.stage && LEAD_STAGES.includes(b.stage)) patch.stage = b.stage;
  if (b.estValue !== undefined) patch.estValue = Number(b.estValue) || 0;
  if (Array.isArray(b.tags)) patch.tags = b.tags;
  patch.lastActivityAt = new Date();

  await Lead.updateOne({ _id: lead._id }, patch);
  const fresh = await Lead.findById(lead._id).lean<ILead>();
  return ok({ lead: serializeLead(fresh!, user.name) });
});

// DELETE /api/leads/:id
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const lead = await loadLead(leadScope(user), id);
  if (!canEditOwned(user, lead.ownerId)) return fail("You can only delete your own leads.", 403);
  await Promise.all([Lead.deleteOne({ _id: lead._id }), Activity.deleteMany({ leadId: lead._id })]);
  return ok({ ok: true });
});
