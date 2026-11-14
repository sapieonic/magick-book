import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import { jsonRequest, ctx } from "../helpers/api";
import type { IUser } from "@/lib/models";
import type { LeadDetail } from "@/lib/types";

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
let leadIdRoute: typeof import("@/app/api/leads/[id]/route");
let stageRoute: typeof import("@/app/api/leads/[id]/stage/route");
let activitiesRoute: typeof import("@/app/api/leads/[id]/activities/route");
let leadAuditRoute: typeof import("@/app/api/leads/[id]/audit/route");

let workspaceId: Types.ObjectId;
let admin: IUser;
let standard: IUser;

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  leadIdRoute = await import("@/app/api/leads/[id]/route");
  stageRoute = await import("@/app/api/leads/[id]/stage/route");
  activitiesRoute = await import("@/app/api/leads/[id]/activities/route");
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
  return models.Lead.create({ workspaceId, ownerId: owner._id, name: "Naresh", source: "Referral", stage: "new", ...over });
}

async function getDetail(id: string): Promise<LeadDetail> {
  const res = await leadIdRoute.GET(jsonRequest(`/api/leads/${id}`, "GET"), ctx({ id }));
  expect(res.status).toBe(200);
  return res.json();
}

async function auditStageMove(leadId: Types.ObjectId, from: string, to: string, at: string) {
  await models.AuditLog.create({
    workspaceId, entity: "lead", entityId: leadId, entityLabel: "Naresh", action: "update",
    actorName: "Admin", changes: [{ field: "stage", from, to }], leadId, createdAt: new Date(at),
  });
}

describe("GET /api/leads/:id stage spans", () => {
  it("falls back to one open span from createdAt when no move was recorded", async () => {
    const lead = await makeLead(admin, { stage: "proposal" });
    const { stages } = await getDetail(String(lead._id));
    expect(stages).toEqual([{ stage: "proposal", enteredAt: lead.createdAt.toISOString(), leftAt: null }]);
  });

  it("folds audited stage moves into spans, oldest first", async () => {
    const lead = await makeLead(admin, { stage: "qualified", createdAt: new Date("2026-07-02T09:00:00Z") });
    await auditStageMove(lead._id, "new", "contacted", "2026-07-05T09:00:00Z");
    await auditStageMove(lead._id, "contacted", "qualified", "2026-07-14T09:00:00Z");
    // An unrelated edit on the same lead does not break the chain.
    await models.AuditLog.create({
      workspaceId, entity: "lead", entityId: lead._id, entityLabel: "Naresh", action: "update",
      actorName: "Admin", changes: [{ field: "estValue", from: 30000, to: 50000 }], leadId: lead._id,
    });

    const { stages } = await getDetail(String(lead._id));
    expect(stages).toEqual([
      { stage: "new", enteredAt: "2026-07-02T09:00:00.000Z", leftAt: "2026-07-05T09:00:00.000Z" },
      { stage: "contacted", enteredAt: "2026-07-05T09:00:00.000Z", leftAt: "2026-07-14T09:00:00.000Z" },
      { stage: "qualified", enteredAt: "2026-07-14T09:00:00.000Z", leftAt: null },
    ]);
  });

  it("records a span for a move made through the stage API", async () => {
    const lead = await makeLead(admin);
    const id = String(lead._id);
    await stageRoute.PATCH(jsonRequest(`/api/leads/${id}/stage`, "PATCH", { stage: "contacted" }), ctx({ id }));
    const { stages } = await getDetail(id);
    expect(stages.map((s) => [s.stage, s.leftAt === null])).toEqual([
      ["new", false],
      ["contacted", true],
    ]);
  });

  it("ignores stage moves recorded on other leads", async () => {
    const lead = await makeLead(admin);
    const other = await makeLead(admin, { name: "Other" });
    await auditStageMove(other._id, "new", "won", "2026-07-05T09:00:00Z");
    const { stages } = await getDetail(String(lead._id));
    expect(stages).toHaveLength(1);
    expect(stages[0].stage).toBe("new");
  });
});

describe("GET /api/leads/:id next step", () => {
  it("returns the viewer's earliest open reminder on the lead", async () => {
    const lead = await makeLead(admin);
    const base = { workspaceId, userId: admin._id, leadId: lead._id };
    await models.Reminder.create({ ...base, title: "Later", dueAt: new Date("2026-12-20T09:00:00Z") });
    await models.Reminder.create({ ...base, title: "Sooner", dueAt: new Date("2026-12-10T09:00:00Z") });
    await models.Reminder.create({ ...base, title: "Done already", dueAt: new Date("2026-12-01T09:00:00Z"), status: "done" });
    await models.Reminder.create({ ...base, title: "Archived", dueAt: new Date("2026-12-02T09:00:00Z"), deletedAt: new Date() });

    const { nextStep } = await getDetail(String(lead._id));
    expect(nextStep?.title).toBe("Sooner");
    expect(nextStep?.leadId).toBe(String(lead._id));
  });

  it("does not surface another user's reminder", async () => {
    const lead = await makeLead(admin);
    await models.Reminder.create({ workspaceId, userId: standard._id, leadId: lead._id, title: "Stan's", dueAt: new Date() });
    const { nextStep } = await getDetail(String(lead._id));
    expect(nextStep).toBeNull();
  });
});

describe("GET /api/leads/:id archived + names", () => {
  it("loads an archived lead (read-only view) with deletedAt set", async () => {
    const lead = await makeLead(admin, { deletedAt: new Date(), deletedBy: admin._id });
    const { lead: dto } = await getDetail(String(lead._id));
    expect(dto.deletedAt).not.toBeNull();
  });

  it("still 404s an archived lead outside the viewer's scope", async () => {
    const lead = await makeLead(admin, { deletedAt: new Date() });
    session.user = standard;
    const res = await leadIdRoute.GET(jsonRequest(`/api/leads/${lead._id}`, "GET"), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(404);
  });

  it("resolves owner and actor names", async () => {
    const lead = await makeLead(standard);
    await models.Activity.create({ workspaceId, leadId: lead._id, actorId: admin._id, kind: "note", title: "Note added", detail: "hi" });
    const { lead: dto, activities } = await getDetail(String(lead._id));
    expect(dto.ownerName).toBe("Stan");
    expect(activities[0].actorName).toBe("Admin");
  });

  it("PATCH answers with the owner's name, not the editor's", async () => {
    const lead = await makeLead(standard);
    const id = String(lead._id);
    const res = await leadIdRoute.PATCH(jsonRequest(`/api/leads/${id}`, "PATCH", { company: "Shivasakthi" }), ctx({ id }));
    const body = await res.json();
    expect(body.lead.company).toBe("Shivasakthi");
    expect(body.lead.ownerName).toBe("Stan");
  });
});

describe("resolving a lead (live, archived, out of scope, malformed)", () => {
  const call = (id: string, method: "GET" | "PATCH" | "DELETE", body?: unknown) => {
    const req = jsonRequest(`/api/leads/${id}`, method, body);
    return (method === "GET" ? leadIdRoute.GET : method === "PATCH" ? leadIdRoute.PATCH : leadIdRoute.DELETE)(req, ctx({ id }));
  };
  const history = (id: string) => leadAuditRoute.GET(jsonRequest(`/api/leads/${id}/audit`, "GET"), ctx({ id }));

  it("404s a malformed id on every lead endpoint instead of a 500", async () => {
    expect((await call("nope", "GET")).status).toBe(404);
    expect((await call("nope", "PATCH", { name: "X" })).status).toBe(404);
    expect((await call("nope", "PATCH", { action: "restore" })).status).toBe(404);
    expect((await call("nope", "DELETE")).status).toBe(404);
    expect((await history("nope")).status).toBe(404);
  });

  it("reads an archived lead's history but refuses edits until it is restored", async () => {
    const lead = await makeLead(admin, { deletedAt: new Date(), deletedBy: admin._id });
    const id = String(lead._id);
    await models.AuditLog.create({ workspaceId, entity: "lead", entityId: lead._id, entityLabel: "Naresh", action: "delete", actorName: "Admin", leadId: lead._id });
    const res = await history(id);
    expect(res.status).toBe(200);
    expect((await res.json()).entries).toHaveLength(1);
    expect((await call(id, "PATCH", { name: "X" })).status).toBe(404);
    expect((await call(id, "DELETE")).status).toBe(404);
    expect((await call(id, "PATCH", { action: "restore" })).status).toBe(200);
  });

  it("only restores an archived lead", async () => {
    const lead = await makeLead(admin);
    expect((await call(String(lead._id), "PATCH", { action: "restore" })).status).toBe(404);
  });

  it("404s another member's lead and its history for a standard user, archived or not", async () => {
    const live = await makeLead(admin);
    const archived = await makeLead(admin, { deletedAt: new Date() });
    session.user = standard;
    for (const lead of [live, archived]) {
      expect((await history(String(lead._id))).status).toBe(404);
      expect((await call(String(lead._id), "PATCH", { action: "restore" })).status).toBe(404);
    }
  });
});

describe("POST /api/leads/:id/activities meeting", () => {
  it("stores a meeting as a note titled 'Meeting logged'", async () => {
    const lead = await makeLead(admin);
    const id = String(lead._id);
    const res = await activitiesRoute.POST(jsonRequest(`/api/leads/${id}/activities`, "POST", { kind: "meeting", detail: "Met the CFO" }), ctx({ id }));
    expect(res.status).toBe(201);
    const { activity } = await res.json();
    expect(activity.kind).toBe("note");
    expect(activity.title).toBe("Meeting logged");
    expect(activity.detail).toBe("Met the CFO");
  });
});
