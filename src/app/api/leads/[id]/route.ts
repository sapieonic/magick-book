import { type NextRequest } from "next/server";
import { ok, fail, route, serializeLead, serializeActivity, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, Activity, type ILead, type IActivity } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope, canEditOwned } from "@/lib/rbac";
import { ownerNameMap, audit, diffChanges } from "@/lib/services";
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

// PATCH /api/leads/:id — edit lead fields, or restore an archived lead (action: "restore").
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));

  // Restore path loads from the ARCHIVED scope (the live scope hides it).
  if (b.action === "restore") {
    const lead = await loadLead(leadScope(user, { archived: true }), id);
    if (!canEditOwned(user, lead.ownerId)) return fail("You can only restore your own leads.", 403);
    await Lead.updateOne({ _id: lead._id }, { $unset: { deletedAt: "", deletedBy: "" } });
    await audit({ entity: "lead", entityId: lead._id, entityLabel: lead.name, action: "restore", actor: user, leadId: lead._id });
    const fresh = await Lead.findById(lead._id).lean<ILead>();
    return ok({ lead: serializeLead(fresh!, user.name) });
  }

  const lead = await loadLead(leadScope(user), id);
  if (!canEditOwned(user, lead.ownerId)) return fail("You can only edit your own leads.", 403);

  const patch: Record<string, unknown> = {};
  for (const f of ["name", "company", "title", "phone", "email", "notes"] as const) {
    if (typeof b[f] === "string") patch[f] = b[f].trim();
  }
  if (b.source && LEAD_SOURCES.includes(b.source)) patch.source = b.source;
  if (b.stage && LEAD_STAGES.includes(b.stage)) patch.stage = b.stage;
  if (b.estValue !== undefined) patch.estValue = Number(b.estValue) || 0;
  if (Array.isArray(b.tags)) patch.tags = b.tags;

  const changes = diffChanges(lead as unknown as Record<string, unknown>, patch, [
    "name", "company", "title", "phone", "email", "notes", "source", "stage", "estValue", "tags",
  ]);
  patch.lastActivityAt = new Date();

  await Lead.updateOne({ _id: lead._id }, patch);
  await audit({ entity: "lead", entityId: lead._id, entityLabel: (patch.name as string) ?? lead.name, action: "update", actor: user, changes, leadId: lead._id });
  const fresh = await Lead.findById(lead._id).lean<ILead>();
  return ok({ lead: serializeLead(fresh!, user.name) });
});

// DELETE /api/leads/:id — soft-delete (archive). Activities are kept for history.
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const lead = await loadLead(leadScope(user), id);
  if (!canEditOwned(user, lead.ownerId)) return fail("You can only delete your own leads.", 403);
  await Lead.updateOne({ _id: lead._id }, { deletedAt: new Date(), deletedBy: user._id });
  await audit({ entity: "lead", entityId: lead._id, entityLabel: lead.name, action: "delete", actor: user, leadId: lead._id });
  return ok({ ok: true });
});
