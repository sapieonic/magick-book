import { type NextRequest } from "next/server";
import { ok, route, serializeLead } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Lead, type ILead } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope } from "@/lib/rbac";
import { logActivity, ownerNameMap } from "@/lib/services";
import { LEAD_STAGES } from "@/lib/constants";
import { Types } from "mongoose";

// GET /api/leads — all leads visible to the user (board + table).
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  await connectDB();
  const q = req.nextUrl.searchParams.get("q")?.trim();

  const filter: Record<string, unknown> = leadScope(user);
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { company: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ];
  }

  const leads = await Lead.find(filter).sort({ stage: 1, order: 1, createdAt: -1 }).lean<ILead[]>();
  const names = await ownerNameMap(leads.map((l) => l.ownerId));
  return ok({ leads: leads.map((l) => serializeLead(l, names.get(String(l.ownerId)) ?? "")) });
});

// POST /api/leads — create a lead.
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  await connectDB();
  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return ok({ error: "Contact name is required" }, 400);

  const stage = LEAD_STAGES.includes(b.stage) ? b.stage : "new";
  const lead = await Lead.create({
    workspaceId: user.workspaceId,
    ownerId: user._id,
    name: b.name.trim(),
    company: b.company?.trim(),
    title: b.title?.trim(),
    phone: b.phone?.trim(),
    email: b.email?.trim(),
    source: b.source || "Website",
    stage,
    estValue: Number(b.estValue) || 0,
    notes: b.notes?.trim(),
    tags: Array.isArray(b.tags) ? b.tags : [],
    order: 0,
    lastActivityAt: new Date(),
  });

  await logActivity({
    workspaceId: user.workspaceId as unknown as Types.ObjectId,
    leadId: lead._id,
    actorId: user._id,
    kind: "lead_created",
    title: "Lead created",
    detail: `from ${lead.source}`,
  });

  const fresh = await Lead.findById(lead._id).lean<ILead>();
  return ok({ lead: serializeLead(fresh!, user.name) }, 201);
});
