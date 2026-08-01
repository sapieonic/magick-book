import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import { jsonRequest, ctx } from "../helpers/api";
import type { IUser } from "@/lib/models";

// Route-level wiring tests: assert each lead route fires the right Slack
// notifier with the right payload. The notifier module itself is mocked here
// (its message-building/escaping/delivery is covered in test/lib/slack.test.ts),
// so these tests verify the integration: event → correct notifier + arguments.

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

// Spies for the Slack notifiers. vi.hoisted so the factory below can close over them.
const slack = vi.hoisted(() => ({
  notifyLeadConverted: vi.fn(async () => {}),
  notifyLeadLost: vi.fn(async () => {}),
  notifyLeadStageChanged: vi.fn(async () => {}),
  notifyLeadComment: vi.fn(async () => {}),
  isSlackConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/slack", () => slack);

let models: typeof import("@/lib/models");
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
  stageRoute = await import("@/app/api/leads/[id]/stage/route");
  convertRoute = await import("@/app/api/leads/[id]/convert/route");
  activitiesRoute = await import("@/app/api/leads/[id]/activities/route");
  await connectDB();
});
afterAll(stopTestDB);

beforeEach(async () => {
  await clearDB();
  Object.values(slack).forEach((fn) => fn.mockClear());
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

describe("Slack — stage changes (lane move)", () => {
  it("notifies notifyLeadStageChanged with from/to on a lane move", async () => {
    const lead = await makeLead(admin, { name: "Priya", company: "Lumen", stage: "new" });
    await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "qualified" }), ctx({ id: String(lead._id) }));

    expect(slack.notifyLeadStageChanged).toHaveBeenCalledTimes(1);
    expect(slack.notifyLeadLost).not.toHaveBeenCalled();
    expect(slack.notifyLeadStageChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: String(lead._id),
        leadName: "Priya",
        company: "Lumen",
        fromStage: "new",
        toStage: "qualified",
        actorName: "Admin",
      }),
    );
  });

  it("does NOT notify when the stage is unchanged", async () => {
    const lead = await makeLead(admin, { stage: "new" });
    await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "new" }), ctx({ id: String(lead._id) }));

    expect(slack.notifyLeadStageChanged).not.toHaveBeenCalled();
    expect(slack.notifyLeadLost).not.toHaveBeenCalled();
  });

  it("does NOT notify on an invalid stage (400 before any work)", async () => {
    const lead = await makeLead(admin);
    const res = await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "bogus" }), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(400);
    expect(slack.notifyLeadStageChanged).not.toHaveBeenCalled();
    expect(slack.notifyLeadLost).not.toHaveBeenCalled();
  });

  it("does NOT notify when a standard user can't see the lead (404)", async () => {
    const lead = await makeLead(admin, { stage: "new" });
    session.user = standard;
    const res = await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "qualified" }), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(404);
    expect(slack.notifyLeadStageChanged).not.toHaveBeenCalled();
  });
});

describe("Slack — marked lost", () => {
  it("notifies notifyLeadLost (not stageChanged) with the from-stage, value, and reason", async () => {
    const lead = await makeLead(admin, { name: "Sam", company: "Acme", stage: "proposal", estValue: 50000 });
    await stageRoute.PATCH(
      jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "lost", lostReason: "Budget cut" }),
      ctx({ id: String(lead._id) }),
    );

    expect(slack.notifyLeadLost).toHaveBeenCalledTimes(1);
    expect(slack.notifyLeadStageChanged).not.toHaveBeenCalled();
    expect(slack.notifyLeadLost).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: String(lead._id),
        leadName: "Sam",
        company: "Acme",
        fromStage: "proposal",
        lostReason: "Budget cut",
        estValue: 50000,
        actorName: "Admin",
      }),
    );
  });

  it("trims the lost reason passed to Slack (matches what's persisted)", async () => {
    const lead = await makeLead(admin, { stage: "qualified" });
    await stageRoute.PATCH(
      jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "lost", lostReason: "   too pricey   " }),
      ctx({ id: String(lead._id) }),
    );
    expect(slack.notifyLeadLost).toHaveBeenCalledWith(expect.objectContaining({ lostReason: "too pricey" }));
  });

  it("sends an undefined reason when none is supplied", async () => {
    const lead = await makeLead(admin, { stage: "qualified" });
    await stageRoute.PATCH(jsonRequest(`/api/leads/${lead._id}/stage`, "PATCH", { stage: "lost" }), ctx({ id: String(lead._id) }));
    expect(slack.notifyLeadLost).toHaveBeenCalledWith(expect.objectContaining({ lostReason: undefined }));
  });
});

describe("Slack — lead converted", () => {
  it("notifies notifyLeadConverted with account + deal details after a successful convert", async () => {
    const lead = await makeLead(admin, { name: "Priya", company: "Lumen", email: "p@l.com", estValue: 12000 });
    const res = await convertRoute.POST(jsonRequest(`/api/leads/${lead._id}/convert`, "POST", { plan: "Pro" }), ctx({ id: String(lead._id) }));
    const { account } = await res.json();

    expect(slack.notifyLeadConverted).toHaveBeenCalledTimes(1);
    expect(slack.notifyLeadConverted).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: String(lead._id),
        leadName: "Priya",
        company: "Lumen",
        accountId: account.id,
        accountName: "Lumen",
        estValue: 12000,
        ownerName: "Admin",
        actorName: "Admin",
      }),
    );
  });

  it("resolves the actual owner's name when a different ownerId is supplied", async () => {
    const owner2 = await models.User.create({ workspaceId, name: "Owner Two", email: "o2@x.com", role: "standard", status: "active" });
    const lead = await makeLead(admin, { name: "Dev", company: "Globex" });

    await convertRoute.POST(
      jsonRequest(`/api/leads/${lead._id}/convert`, "POST", { ownerId: String(owner2._id) }),
      ctx({ id: String(lead._id) }),
    );

    expect(slack.notifyLeadConverted).toHaveBeenCalledWith(
      expect.objectContaining({ ownerName: "Owner Two", actorName: "Admin" }),
    );
  });

  it("does NOT notify when the lead is already converted (409)", async () => {
    const lead = await makeLead(admin, { convertedAccountId: new Types.ObjectId() });
    const res = await convertRoute.POST(jsonRequest(`/api/leads/${lead._id}/convert`, "POST", {}), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(409);
    expect(slack.notifyLeadConverted).not.toHaveBeenCalled();
  });
});

describe("Slack — comments / activities", () => {
  it("notifies notifyLeadComment for a note with its body", async () => {
    const lead = await makeLead(admin, { name: "Ana", company: "Initech" });
    await activitiesRoute.POST(
      jsonRequest(`/api/leads/${lead._id}/activities`, "POST", { kind: "note", detail: "Spoke to CFO" }),
      ctx({ id: String(lead._id) }),
    );

    expect(slack.notifyLeadComment).toHaveBeenCalledTimes(1);
    expect(slack.notifyLeadComment).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: String(lead._id),
        leadName: "Ana",
        company: "Initech",
        title: "Note added",
        detail: "Spoke to CFO",
        actorName: "Admin",
      }),
    );
  });

  it("notifies for an outbound contact method with the right title", async () => {
    const lead = await makeLead(admin);
    await activitiesRoute.POST(jsonRequest(`/api/leads/${lead._id}/activities`, "POST", { kind: "call" }), ctx({ id: String(lead._id) }));
    expect(slack.notifyLeadComment).toHaveBeenCalledWith(expect.objectContaining({ title: "Call logged" }));
  });

  it("does NOT notify on an invalid activity kind (400)", async () => {
    const lead = await makeLead(admin);
    const res = await activitiesRoute.POST(jsonRequest(`/api/leads/${lead._id}/activities`, "POST", { kind: "bogus" }), ctx({ id: String(lead._id) }));
    expect(res.status).toBe(400);
    expect(slack.notifyLeadComment).not.toHaveBeenCalled();
  });

  it("does NOT notify when the lead is out of scope (404)", async () => {
    const lead = await makeLead(admin);
    session.user = standard;
    const res = await activitiesRoute.POST(
      jsonRequest(`/api/leads/${lead._id}/activities`, "POST", { kind: "note", detail: "x" }),
      ctx({ id: String(lead._id) }),
    );
    expect(res.status).toBe(404);
    expect(slack.notifyLeadComment).not.toHaveBeenCalled();
  });
});
