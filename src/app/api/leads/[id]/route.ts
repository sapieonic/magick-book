import { type NextRequest } from "next/server";
import { ok, fail, route, serializeLead, serializeActivity, serializeReminder, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, Activity, Reminder, type ILead, type IActivity, type IReminder } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope, reminderScope, canEditOwned } from "@/lib/rbac";
import { ownerNameMap, audit, diffChanges, leadStageSpans } from "@/lib/services";
import type { LeadDetail } from "@/lib/types";
import { LEAD_SOURCES, LEAD_STAGES } from "@/lib/constants";
import { resolveLeadCategory } from "@/lib/lead-categories";

type Ctx = { params: Promise<{ id: string }> };

async function loadLead(userScope: Record<string, unknown>, id: string) {
  const lead = await Lead.findOne({ _id: id, ...userScope }).lean<ILead>();
  if (!lead) throw new HttpError("Lead not found", 404);
  return lead;
}

/** Re-read a lead after a write, with its owner's name (not the editor's). */
async function freshLead(id: ILead["_id"]) {
  const lead = (await Lead.findById(id).lean<ILead>())!;
  const names = await ownerNameMap([lead.ownerId]);
  return serializeLead(lead, names.get(String(lead.ownerId)) ?? "");
}

// GET /api/leads/:id — lead, activity timeline, time in each stage and the viewer's next step.
// Archived leads load too (read-only on the page) so they can be reviewed and restored.
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const lead =
    (await Lead.findOne({ _id: id, ...leadScope(user) }).lean<ILead>()) ??
    (await loadLead(leadScope(user, { archived: true }), id));

  const [activities, stages, nextStep] = await Promise.all([
    Activity.find({ leadId: lead._id }).sort({ createdAt: -1 }).lean<IActivity[]>(),
    leadStageSpans(lead),
    Reminder.findOne({ ...reminderScope(user), leadId: lead._id, status: { $in: ["scheduled", "sent", "failed"] } })
      .sort({ dueAt: 1 })
      .lean<IReminder>(),
  ]);
  const names = await ownerNameMap([lead.ownerId, ...activities.flatMap((a) => (a.actorId ? [a.actorId] : []))]);

  return ok<LeadDetail>({
    lead: serializeLead(lead, names.get(String(lead.ownerId)) ?? ""),
    activities: activities.map((a) => serializeActivity(a, names.get(String(a.actorId)) ?? "")),
    stages,
    nextStep: nextStep ? serializeReminder(nextStep) : null,
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
    return ok({ lead: await freshLead(lead._id) });
  }

  const lead = await loadLead(leadScope(user), id);
  if (!canEditOwned(user, lead.ownerId)) return fail("You can only edit your own leads.", 403);

  const patch: Record<string, unknown> = {};
  for (const f of ["name", "company", "title", "phone", "email", "notes"] as const) {
    if (typeof b[f] === "string") patch[f] = b[f].trim();
  }
  if (b.source && LEAD_SOURCES.includes(b.source)) patch.source = b.source;
  if (b.stage && LEAD_STAGES.includes(b.stage)) patch.stage = b.stage;
  if (typeof b.category === "string") {
    const resolved = await resolveLeadCategory(user.workspaceId, b.category, {
      mode: "update",
      current: lead.category,
    });
    if (resolved) patch.category = resolved;
  }
  if (b.estValue !== undefined) patch.estValue = Number(b.estValue) || 0;
  if (Array.isArray(b.tags)) patch.tags = b.tags;

  const changes = diffChanges(lead as unknown as Record<string, unknown>, patch, [
    "name", "company", "title", "phone", "email", "notes", "source", "stage", "category", "estValue", "tags",
  ]);
  patch.lastActivityAt = new Date();

  await Lead.updateOne({ _id: lead._id }, patch);
  await audit({ entity: "lead", entityId: lead._id, entityLabel: (patch.name as string) ?? lead.name, action: "update", actor: user, changes, leadId: lead._id });
  return ok({ lead: await freshLead(lead._id) });
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
