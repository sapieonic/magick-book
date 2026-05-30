import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import { jsonRequest, ctx } from "../helpers/api";
import type { IUser } from "@/lib/models";

// Mutable holder so each test can set the "logged in" user.
const session: { user: IUser | null } = { user: null };

vi.mock("@/lib/auth/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/server")>();
  return {
    ...actual,
    requireUser: vi.fn(async () => {
      if (!session.user) throw new actual.UnauthorizedError();
      return session.user;
    }),
    getCurrentUser: vi.fn(async () => session.user),
  };
});

let models: typeof import("@/lib/models");
let leadsRoute: typeof import("@/app/api/leads/route");
let leadIdRoute: typeof import("@/app/api/leads/[id]/route");
let stageRoute: typeof import("@/app/api/leads/[id]/stage/route");
let convertRoute: typeof import("@/app/api/leads/[id]/convert/route");
let activitiesRoute: typeof import("@/app/api/leads/[id]/activities/route");

let workspaceId: Types.ObjectId;
let admin: IUser;
let standard: IUser;

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  leadsRoute = await import("@/app/api/leads/route");
  leadIdRoute = await import("@/app/api/leads/[id]/route");
  stageRoute = await import("@/app/api/leads/[id]/stage/route");
  convertRoute = await import("@/app/api/leads/[id]/convert/route");
  activitiesRoute = await import("@/app/api/leads/[id]/activities/route");
  await connectDB();
});
afterAll(stopTestDB);

beforeEach(async () => {
  await clearDB();
  workspaceId = new Types.ObjectId();
  const a = await models.User.create({ workspaceId, name: "Admin", email: "admin@x.com", role: "admin", status: "active" });
  const s = await models.User.create({ workspaceId, name: "Stan", email: "stan@x.com", role: "standard", status: "active" });
  admin = a.toObject() as IUser;
  standard = s.toObject() as IUser;
  session.user = admin;
});

async function makeLead(owner: IUser, over: Record<string, unknown> = {}) {
  return models.Lead.create({ workspaceId, ownerId: owner._id, name: "Lead", source: "Website", stage: "new", ...over });
}

describe("POST /api/leads", () => {
  it("creates a lead and logs a lead_created activity", async () => {
    const res = await leadsRoute.POST(jsonRequest("/api/leads", "POST", { name: "Priya", company: "Lumen", estValue: 5000, source: "Referral" }));
    expect(res.status).toBe(201);
    const { lead } = await res.json();
    expect(lead.name).toBe("Priya");
    expect(lead.ownerId).toBe(String(admin._id));
    const acts = await models.Activity.find({ leadId: lead.id }).lean();
    expect(acts).toHaveLength(1);
    expect(acts[0].kind).toBe("lead_created");
  });

  it("rejects a blank name with 400", async () => {
    const res = await leadsRoute.POST(jsonRequest("/api/leads", "POST", { name: "  " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name is required/i);
  });

  it("returns 401 when not authenticated", async () => {
    session.user = null;
    const res = await leadsRoute.POST(jsonRequest("/api/leads", "POST", { name: "X" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/leads scoping", () => {
  it("admin sees all leads in the workspace", async () => {
    await makeLead(admin, { name: "A" });
    await makeLead(standard, { name: "B" });
    session.user = admin;
    const res = await leadsRoute.GET(jsonRequest("/api/leads", "GET"));
    const { leads } = await res.json();
    expect(leads.map((l: { name: string }) => l.name).sort()).toEqual(["A", "B"]);
  });

  it("standard user sees only leads they own (leadScope applied)", async () => {
    await makeLead(admin, { name: "A" });
    await makeLead(standard, { name: "B" });
    session.user = standard;
    const res = await leadsRoute.GET(jsonRequest("/api/leads", "GET"));
    const { leads } = await res.json();
    expect(leads.map((l: { name: string }) => l.name)).toEqual(["B"]);
  });

  it("supports a text query filter", async () => {
    await makeLead(admin, { name: "Priya Sharma", company: "Lumen" });
    await makeLead(admin, { name: "Other" });
    const res = await leadsRoute.GET(jsonRequest("/api/leads?q=lumen", "GET"));
    const { leads } = await res.json();
    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe("Priya Sharma");
  });
});

describe("GET /api/leads/:id (detail + activities)", () => {
  it("returns the lead and its activity timeline newest-first", async () => {
    const lead = await makeLead(admin, { name: "Detail" });
    await models.Activity.create({ workspaceId, leadId: lead._id, actorId: admin._id, kind: "lead_created", title: "Lead created" });
    const res = await leadIdRoute.GET(jsonRequest(`/api/leads/${lead._id}`, "GET"), ctx({ id: String(lead._id) }));
    const body = await res.json();
    expect(body.lead.name).toBe("Detail");
    expect(body.activities).toHaveLength(1);
    expect(body.activities[0].actorName).toBe("Admin");
  });

  it("returns 404 for a lead outside the user's scope", async () => {
    const lead = await makeLead(admin);
    session.user = standard;
    const res = await leadIdRoute.GET(jsonRequest(`/api/leads/${lead._id}`, "GET"), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/leads/:id", () => {
  it("edits allowed fields", async () => {
    const lead = await makeLead(admin, { name: "Old" });
    const res = await leadIdRoute.PATCH(jsonRequest(`/api/leads/${lead._id}`, "PATCH", { name: "New", estValue: 9000, source: "Event" }), ctx({ id: String(lead._id) }));
    const { lead: updated } = await res.json();
    expect(updated.name).toBe("New");
    expect(updated.estValue).toBe(9000);
    expect(updated.source).toBe("Event");
  });

  it("403 when a standard user edits a lead they don't own", async () => {
    const lead = await makeLead(admin);
    session.user = standard;
    // standard can't even see it -> 404 (scope blocks before ownership check)
    const res = await leadIdRoute.PATCH(jsonRequest(`/api/leads/${lead._id}`, "PATCH", { name: "X" }), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/leads/:id/stage", () => {
  it("moves stage and logs a stage_change activity", async () => {
    const lead = await makeLead(admin, { stage: "new" });
    const res = await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "qualified" }), ctx({ id: String(lead._id) }));
    const { lead: updated } = await res.json();
    expect(updated.stage).toBe("qualified");
    const acts = await models.Activity.find({ leadId: lead._id, kind: "stage_change" }).lean();
    expect(acts).toHaveLength(1);
    expect(acts[0].title).toBe("Qualified");
  });

  it("does not log when the stage is unchanged", async () => {
    const lead = await makeLead(admin, { stage: "new" });
    await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "new" }), ctx({ id: String(lead._id) }));
    expect(await models.Activity.countDocuments({ leadId: lead._id, kind: "stage_change" })).toBe(0);
  });

  it("records lostReason and a 'Marked lost' title when moving to lost", async () => {
    const lead = await makeLead(admin, { stage: "proposal" });
    await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "lost", lostReason: "budget" }), ctx({ id: String(lead._id) }));
    const fresh = await models.Lead.findById(lead._id).lean();
    expect(fresh?.lostReason).toBe("budget");
    const act = await models.Activity.findOne({ leadId: lead._id, kind: "stage_change" }).lean();
    expect(act?.title).toBe("Marked lost");
    expect(act?.detail).toBe("budget");
  });

  it("rejects an invalid stage", async () => {
    const lead = await makeLead(admin);
    const res = await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "bogus" }), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/leads/:id/convert", () => {
  it("creates an account + primary contact, marks lead won+converted, carries activities", async () => {
    const lead = await makeLead(admin, { name: "Priya", company: "Lumen", title: "CTO", email: "p@l.com", phone: "+91", estValue: 12000 });
    await models.Activity.create({ workspaceId, leadId: lead._id, actorId: admin._id, kind: "lead_created", title: "Lead created" });

    const res = await convertRoute.POST(jsonRequest(`/api/leads/${lead._id}/convert`, "POST", { plan: "Pro" }), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(201);
    const { account } = await res.json();
    expect(account.name).toBe("Lumen");
    expect(account.value).toBe(12000);
    expect(account.primaryContact.name).toBe("Priya");
    expect(account.primaryContact.isPrimary).toBe(true);

    const freshLead = await models.Lead.findById(lead._id).lean();
    expect(freshLead?.stage).toBe("won");
    expect(String(freshLead?.convertedAccountId)).toBe(account.id);

    // original activity now also tagged to the account + a converted activity exists
    const onAccount = await models.Activity.find({ accountId: account.id }).lean();
    expect(onAccount.some((a) => a.kind === "lead_created")).toBe(true);
    expect(onAccount.some((a) => a.kind === "converted")).toBe(true);
  });

  it("409 when the lead is already converted", async () => {
    const lead = await makeLead(admin, { convertedAccountId: new Types.ObjectId() });
    const res = await convertRoute.POST(jsonRequest(`/api/leads/${lead._id}/convert`, "POST", {}), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(409);
  });
});

describe("POST /api/leads/:id/activities", () => {
  it("creates a note attributed to the actor (audit-log notes)", async () => {
    const lead = await makeLead(admin);
    const res = await activitiesRoute.POST(jsonRequest(`/api/leads/${lead._id}/activities`, "POST", { kind: "note", detail: "Spoke to CFO" }), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(201);
    const { activity } = await res.json();
    expect(activity.kind).toBe("note");
    expect(activity.title).toBe("Note added");
    expect(activity.detail).toBe("Spoke to CFO");
    expect(activity.actorName).toBe("Admin");
  });

  it("creates a 'call' activity with the right title", async () => {
    const lead = await makeLead(admin);
    const res = await activitiesRoute.POST(jsonRequest(`/api/leads/${lead._id}/activities`, "POST", { kind: "call" }), ctx({ id: String(lead._id) }));
    const { activity } = await res.json();
    expect(activity.kind).toBe("call");
    expect(activity.title).toBe("Call logged");
  });

  it("rejects an invalid activity kind", async () => {
    const lead = await makeLead(admin);
    const res = await activitiesRoute.POST(jsonRequest(`/api/leads/${lead._id}/activities`, "POST", { kind: "bogus" }), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(400);
  });
});
