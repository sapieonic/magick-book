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
let activityIdRoute: typeof import("@/app/api/leads/[id]/activities/[activityId]/route");
let leadAuditRoute: typeof import("@/app/api/leads/[id]/audit/route");

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
  activityIdRoute = await import("@/app/api/leads/[id]/activities/[activityId]/route");
  leadAuditRoute = await import("@/app/api/leads/[id]/audit/route");
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
    await models.Workspace.create({ _id: workspaceId, name: "WS", ownerId: admin._id, leadCategories: ["unclassified", "finance", "automobile"] });
    const res = await leadsRoute.POST(jsonRequest("/api/leads", "POST", { name: "Priya", company: "Lumen", estValue: 5000, source: "Referral", category: "finance" }));
    expect(res.status).toBe(201);
    const { lead } = await res.json();
    expect(lead.name).toBe("Priya");
    expect(lead.category).toBe("finance");
    expect(lead.ownerId).toBe(String(admin._id));
    const acts = await models.Activity.find({ leadId: lead.id }).lean();
    expect(acts).toHaveLength(1);
    expect(acts[0].kind).toBe("lead_created");
  });

  it("defaults category to unclassified when omitted or unknown", async () => {
    await models.Workspace.create({ _id: workspaceId, name: "WS", ownerId: admin._id, leadCategories: ["unclassified", "finance"] });
    const res = await leadsRoute.POST(jsonRequest("/api/leads", "POST", { name: "X", category: "nope" }));
    expect(res.status).toBe(201);
    const { lead } = await res.json();
    expect(lead.category).toBe("unclassified");
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
    await models.Workspace.create({ _id: workspaceId, name: "WS", ownerId: admin._id, leadCategories: ["unclassified", "healthcare"] });
    const lead = await makeLead(admin, { name: "Old" });
    const res = await leadIdRoute.PATCH(jsonRequest(`/api/leads/${lead._id}`, "PATCH", { name: "New", estValue: 9000, source: "Event", category: "healthcare" }), ctx({ id: String(lead._id) }));
    const { lead: updated } = await res.json();
    expect(updated.name).toBe("New");
    expect(updated.estValue).toBe(9000);
    expect(updated.source).toBe("Event");
    expect(updated.category).toBe("healthcare");
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

  it("moves a lead into the parked holding lane", async () => {
    const lead = await makeLead(admin, { stage: "contacted" });
    const res = await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "parked" }), ctx({ id: String(lead._id) }));
    const { lead: updated } = await res.json();
    expect(updated.stage).toBe("parked");
    const acts = await models.Activity.find({ leadId: lead._id, kind: "stage_change" }).lean();
    expect(acts).toHaveLength(1);
    expect(acts[0].title).toBe("Parked");
  });

  it("returns the lead with its real owner's name when an admin moves someone else's lead", async () => {
    const lead = await makeLead(standard, { stage: "new" });
    const res = await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "contacted" }), ctx({ id: String(lead._id) }));
    const { lead: updated } = await res.json();
    expect(updated.ownerName).toBe("Stan");
  });

  it("ignores the old numeric `order` slot: a same-lane PATCH without neighbours leaves the order alone", async () => {
    const lead = await makeLead(admin, { stage: "new", order: 3 });
    await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "new", order: 0 }), ctx({ id: String(lead._id) }));
    expect((await models.Lead.findById(lead._id).lean())?.order).toBe(3);
  });

  it("404 for a malformed id or an archived lead", async () => {
    const malformed = await stageRoute.PATCH(jsonRequest("/api/leads/nope/stage", "PATCH", { stage: "qualified" }), ctx({ id: "nope" }));
    expect(malformed.status).toBe(404);
    const gone = await makeLead(admin, { deletedAt: new Date() });
    const res = await stageRoute.PATCH(jsonRequest(`/api/leads/${gone._id}/stage`, "PATCH", { stage: "qualified" }), ctx({ id: String(gone._id) }));
    expect(res.status).toBe(404);
  });

  it("404 when a standard user moves a lead outside their scope", async () => {
    const lead = await makeLead(admin, { stage: "new" });
    session.user = standard;
    const res = await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "qualified" }), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/leads/:id/stage placement (beforeId / afterId)", () => {
  type Named = { _id: Types.ObjectId; name: string };
  const drop = (lead: Named, body: Record<string, unknown>) =>
    stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "qualified", ...body }), ctx({ id: String(lead._id) }));
  /** The qualified lane as the user in `session` sees it from GET /api/leads. */
  async function lane(): Promise<string[]> {
    const { leads } = await (await leadsRoute.GET(jsonRequest("/api/leads", "GET"))).json();
    return leads.filter((l: { stage: string }) => l.stage === "qualified").map((l: { name: string }) => l.name);
  }
  const orders = async () => Object.fromEntries((await models.Lead.find({ stage: "qualified" }).lean()).map((l) => [l.name, l.order]));

  it("drops between two order-0 cards exactly where it was put (the reviewer's example)", async () => {
    const a = await makeLead(admin, { name: "A", stage: "qualified" });
    const b = await makeLead(admin, { name: "B", stage: "qualified" });
    await makeLead(admin, { name: "C", stage: "qualified" });
    const d = await makeLead(admin, { name: "D", stage: "new" });
    expect(await lane()).toEqual(["A", "B", "C"]); // all order 0: oldest first, like the board
    await drop(d, { beforeId: String(a._id), afterId: String(b._id) });
    expect(await lane()).toEqual(["A", "D", "B", "C"]);
  });

  it("lands right after beforeId when the user's filtered view skips cards in between", async () => {
    const a = await makeLead(admin, { name: "A", stage: "qualified" });
    await makeLead(admin, { name: "B", stage: "qualified" });
    const c = await makeLead(admin, { name: "C", stage: "qualified" });
    await makeLead(admin, { name: "E", stage: "qualified" });
    const d = await makeLead(admin, { name: "D", stage: "new" });
    // A search showed only A and C, adjacent on screen; B sits between them in the real lane.
    await drop(d, { beforeId: String(a._id), afterId: String(c._id) });
    expect(await lane()).toEqual(["A", "D", "B", "C", "E"]);
  });

  it("keeps the admin's combined lane consistent when a standard user drops among their own cards", async () => {
    await makeLead(admin, { name: "X1", stage: "qualified" });
    const s1 = await makeLead(standard, { name: "S1", stage: "qualified" });
    await makeLead(admin, { name: "X2", stage: "qualified" });
    const s2 = await makeLead(standard, { name: "S2", stage: "qualified" });
    const s3 = await makeLead(standard, { name: "S3", stage: "new" });
    const s4 = await makeLead(standard, { name: "S4", stage: "new" });

    session.user = standard;
    await drop(s3, { beforeId: String(s1._id), afterId: String(s2._id) });
    await drop(s4, { afterId: String(s1._id) }); // top of their view: directly above S1, below X1
    expect(await lane()).toEqual(["S4", "S1", "S3", "S2"]);
    session.user = admin;
    expect(await lane()).toEqual(["X1", "S4", "S1", "S3", "X2", "S2"]);
    // Orders stay distinct across owners: no collisions for the next drop to trip on.
    const all = await models.Lead.find({ stage: "qualified" }).lean();
    expect(new Set(all.map((l) => l.order)).size).toBe(all.length);
  });

  it("ignores a neighbour that is malformed, out of scope, in another lane or archived", async () => {
    const x = await makeLead(admin, { name: "X", stage: "qualified" });
    const s1 = await makeLead(standard, { name: "S1", stage: "qualified" });
    const elsewhere = await makeLead(standard, { name: "W", stage: "won" });
    const gone = await makeLead(standard, { name: "G", stage: "qualified", deletedAt: new Date() });
    const s2 = await makeLead(standard, { name: "S2", stage: "new" });
    const s3 = await makeLead(standard, { name: "S3", stage: "new" });

    session.user = standard;
    // Someone else's card and junk: no usable neighbour, so the cross-lane move lands at the end.
    expect((await drop(s2, { beforeId: String(x._id), afterId: "nope" })).status).toBe(200);
    // Another lane's card and an archived one are skipped; the valid afterId still places it.
    await drop(s3, { beforeId: String(elsewhere._id), afterId: String(gone._id) });
    session.user = admin;
    expect(await lane()).toEqual(["X", "S1", "S2", "S3"]);
    await drop(s3, { beforeId: String(gone._id), afterId: String(s1._id) });
    expect(await lane()).toEqual(["X", "S3", "S1", "S2"]);
  });

  it("writes only the moved lead when its neighbours leave room", async () => {
    const a = await makeLead(admin, { name: "A", stage: "qualified", order: 1024 });
    const b = await makeLead(admin, { name: "B", stage: "qualified", order: 2048 });
    const d = await makeLead(admin, { name: "D", stage: "new" });
    const bulk = vi.spyOn(models.Lead, "bulkWrite");
    const updateOne = vi.spyOn(models.Lead, "updateOne");
    const updateMany = vi.spyOn(models.Lead, "updateMany");
    try {
      await drop(d, { beforeId: String(a._id), afterId: String(b._id) });
      expect(bulk).toHaveBeenCalledTimes(1);
      expect(bulk.mock.calls[0][0]).toHaveLength(1);
      expect(updateOne).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
    expect(await orders()).toEqual({ A: 1024, D: 1536, B: 2048 });
  });

});

describe("POST /api/leads/:id/convert", () => {
  it("names the chosen account owner, not the admin who converted", async () => {
    const lead = await makeLead(admin, { company: "Orbit" });
    const res = await convertRoute.POST(
      jsonRequest(`/api/leads/${lead._id}/convert`, "POST", { ownerId: String(standard._id) }),
      ctx({ id: String(lead._id) }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).account.ownerName).toBe("Stan");
  });

  it("404s a malformed lead id instead of failing", async () => {
    const res = await convertRoute.POST(jsonRequest(`/api/leads/nope/convert`, "POST", {}), ctx({ id: "nope" }));
    expect(res.status).toBe(404);
  });

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

describe("PATCH /api/leads/:id/activities/:activityId (edit a note)", () => {
  async function makeNote(owner: IUser, lead: { _id: Types.ObjectId }, detail = "original") {
    return models.Activity.create({ workspaceId, leadId: lead._id, actorId: owner._id, kind: "note", title: "Note added", detail });
  }

  it("edits the author's own note and stamps editedAt", async () => {
    const lead = await makeLead(admin);
    const note = await makeNote(admin, lead);
    const res = await activityIdRoute.PATCH(
      jsonRequest(`/api/leads/${lead._id}/activities/${note._id}`, "PATCH", { detail: "updated note" }),
      ctx({ id: String(lead._id), activityId: String(note._id) }),
    );
    expect(res.status).toBe(200);
    const { activity } = await res.json();
    expect(activity.detail).toBe("updated note");
    expect(activity.editedAt).toBeTruthy();
    const fresh = await models.Activity.findById(note._id).lean();
    expect(fresh!.detail).toBe("updated note");
    expect(fresh!.editedAt).toBeInstanceOf(Date);
  });

  it("refuses to edit a note authored by someone else (even an admin who can see the lead)", async () => {
    // Lead owned by the standard user; admin can see it (workspace-wide) but didn't write the note.
    const lead = await makeLead(standard);
    const note = await makeNote(standard, lead);
    session.user = admin;
    const res = await activityIdRoute.PATCH(
      jsonRequest(`/api/leads/${lead._id}/activities/${note._id}`, "PATCH", { detail: "hijack" }),
      ctx({ id: String(lead._id), activityId: String(note._id) }),
    );
    expect(res.status).toBe(403);
    const fresh = await models.Activity.findById(note._id).lean();
    expect(fresh!.detail).toBe("original");
  });

  it("refuses to edit a non-note activity", async () => {
    const lead = await makeLead(admin);
    const sys = await models.Activity.create({ workspaceId, leadId: lead._id, actorId: admin._id, kind: "call", title: "Call logged", detail: "rang" });
    const res = await activityIdRoute.PATCH(
      jsonRequest(`/api/leads/${lead._id}/activities/${sys._id}`, "PATCH", { detail: "nope" }),
      ctx({ id: String(lead._id), activityId: String(sys._id) }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an empty note body", async () => {
    const lead = await makeLead(admin);
    const note = await makeNote(admin, lead);
    const res = await activityIdRoute.PATCH(
      jsonRequest(`/api/leads/${lead._id}/activities/${note._id}`, "PATCH", { detail: "   " }),
      ctx({ id: String(lead._id), activityId: String(note._id) }),
    );
    expect(res.status).toBe(400);
  });

  it("404s when the note belongs to a different lead", async () => {
    const lead = await makeLead(admin);
    const other = await makeLead(admin, { name: "Other" });
    const note = await makeNote(admin, other);
    const res = await activityIdRoute.PATCH(
      jsonRequest(`/api/leads/${lead._id}/activities/${note._id}`, "PATCH", { detail: "x" }),
      ctx({ id: String(lead._id), activityId: String(note._id) }),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE + restore /api/leads/:id (soft-delete)", () => {
  it("archives a lead, hides it from the live list, surfaces it under ?archived=1, and restores it", async () => {
    const lead = await makeLead(admin, { name: "Bye" });
    const del = await leadIdRoute.DELETE(jsonRequest(`/api/leads/${lead._id}`, "DELETE"), ctx({ id: String(lead._id) }));
    expect(del.status).toBe(200);

    const fresh = await models.Lead.findById(lead._id).lean();
    expect(fresh!.deletedAt).toBeInstanceOf(Date);

    const live = await (await leadsRoute.GET(jsonRequest("/api/leads", "GET"))).json();
    expect(live.leads.find((l: { name: string }) => l.name === "Bye")).toBeUndefined();

    const archived = await (await leadsRoute.GET(jsonRequest("/api/leads?archived=1", "GET"))).json();
    expect(archived.leads.map((l: { name: string }) => l.name)).toContain("Bye");

    const restored = await leadIdRoute.PATCH(jsonRequest(`/api/leads/${lead._id}`, "PATCH", { action: "restore" }), ctx({ id: String(lead._id) }));
    expect(restored.status).toBe(200);
    expect((await restored.json()).lead.deletedAt).toBeNull();

    const back = await (await leadsRoute.GET(jsonRequest("/api/leads", "GET"))).json();
    expect(back.leads.find((l: { name: string }) => l.name === "Bye")).toBeDefined();
  });

  it("403 when a standard user archives a lead they don't own", async () => {
    const lead = await makeLead(admin);
    session.user = standard;
    const res = await leadIdRoute.DELETE(jsonRequest(`/api/leads/${lead._id}`, "DELETE"), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(404); // scope hides it before ownership check
  });
});

describe("GET /api/leads/:id/audit (change history)", () => {
  it("records create, field edits (with diffs), stage moves, and delete", async () => {
    const created = await leadsRoute.POST(jsonRequest("/api/leads", "POST", { name: "Asha", estValue: 1000 }));
    const id = (await created.json()).lead.id;

    await leadIdRoute.PATCH(jsonRequest(`/api/leads/${id}`, "PATCH", { name: "Asha V", estValue: 5000 }), ctx({ id }));
    await stageRoute.PATCH(jsonRequest(`/api/leads/${id}/stage`, "PATCH", { stage: "qualified" }), ctx({ id }));
    await leadIdRoute.DELETE(jsonRequest(`/api/leads/${id}`, "DELETE"), ctx({ id }));

    const res = await leadAuditRoute.GET(jsonRequest(`/api/leads/${id}/audit`, "GET"), ctx({ id }));
    expect(res.status).toBe(200);
    const { entries } = await res.json();
    const actions = entries.map((e: { action: string }) => e.action);
    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("delete");

    // The field edit captured a name + estValue diff.
    const edit = entries.find((e: { changes: { field: string }[] }) => e.changes.some((c) => c.field === "name"));
    expect(edit).toBeDefined();
    const nameChange = edit.changes.find((c: { field: string }) => c.field === "name");
    expect(nameChange.from).toBe("Asha");
    expect(nameChange.to).toBe("Asha V");
  });
});
