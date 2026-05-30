import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import { jsonRequest, ctx } from "../helpers/api";
import type { IUser } from "@/lib/models";

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
let membersRoute: typeof import("@/app/api/members/route");
let memberIdRoute: typeof import("@/app/api/members/[id]/route");

let workspaceId: Types.ObjectId;
let owner: IUser;
let admin: IUser;
let standard: IUser;

const ENV = process.env.DOMAIN_WHITELIST;

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  membersRoute = await import("@/app/api/members/route");
  memberIdRoute = await import("@/app/api/members/[id]/route");
  await connectDB();
});
afterAll(stopTestDB);
afterEach(() => {
  if (ENV === undefined) delete process.env.DOMAIN_WHITELIST;
  else process.env.DOMAIN_WHITELIST = ENV;
});

beforeEach(async () => {
  await clearDB();
  delete process.env.DOMAIN_WHITELIST;
  workspaceId = new Types.ObjectId();
  owner = (await models.User.create({ workspaceId, name: "Owner", email: "owner@x.com", role: "admin", status: "active" })).toObject() as IUser;
  await models.Workspace.create({ _id: workspaceId, name: "WS", ownerId: owner._id, domain: "x.com" });
  admin = owner;
  standard = (await models.User.create({ workspaceId, name: "Stan", email: "stan@x.com", role: "standard", status: "active" })).toObject() as IUser;
  session.user = admin;
});

describe("GET /api/members", () => {
  it("returns the team and isAdmin flag", async () => {
    const res = await membersRoute.GET();
    const body = await res.json();
    expect(body.isAdmin).toBe(true);
    expect(body.members.map((m: { email: string }) => m.email).sort()).toEqual(["owner@x.com", "stan@x.com"]);
    const me = body.members.find((m: { email: string }) => m.email === "owner@x.com");
    expect(me.isYou).toBe(true);
  });

  it("isAdmin is false for a standard user", async () => {
    session.user = standard;
    const body = await (await membersRoute.GET()).json();
    expect(body.isAdmin).toBe(false);
  });
});

describe("POST /api/members (invite)", () => {
  it("admin can invite a new teammate", async () => {
    const res = await membersRoute.POST(jsonRequest("/api/members", "POST", { email: "new@x.com", role: "standard" }));
    expect(res.status).toBe(201);
    const { member } = await res.json();
    expect(member.email).toBe("new@x.com");
    expect(member.status).toBe("invited");
    expect(member.invitedByName).toBe("Owner");
  });

  it("403 for a standard user", async () => {
    session.user = standard;
    const res = await membersRoute.POST(jsonRequest("/api/members", "POST", { email: "new@x.com" }));
    expect(res.status).toBe(403);
  });

  it("403 when the email's domain isn't whitelisted", async () => {
    process.env.DOMAIN_WHITELIST = "@x.com";
    const res = await membersRoute.POST(jsonRequest("/api/members", "POST", { email: "evil@other.com" }));
    expect(res.status).toBe(403);
  });

  it("allows a whitelisted domain", async () => {
    process.env.DOMAIN_WHITELIST = "@x.com";
    const res = await membersRoute.POST(jsonRequest("/api/members", "POST", { email: "good@x.com" }));
    expect(res.status).toBe(201);
  });

  it("409 when the person is already on the team", async () => {
    const res = await membersRoute.POST(jsonRequest("/api/members", "POST", { email: "stan@x.com" }));
    expect(res.status).toBe(409);
  });

  it("400 for an invalid email", async () => {
    const res = await membersRoute.POST(jsonRequest("/api/members", "POST", { email: "notanemail" }));
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/members/:id (role change)", () => {
  it("admin can promote a standard user", async () => {
    const res = await memberIdRoute.PATCH(jsonRequest(`/api/members/${standard._id}`, "PATCH", { role: "admin" }), ctx({ id: String(standard._id) }));
    const { member } = await res.json();
    expect(member.role).toBe("admin");
  });

  it("403 for a standard user", async () => {
    session.user = standard;
    const res = await memberIdRoute.PATCH(jsonRequest(`/api/members/${standard._id}`, "PATCH", { role: "admin" }), ctx({ id: String(standard._id) }));
    expect(res.status).toBe(403);
  });

  it("409 when trying to demote the workspace owner", async () => {
    const res = await memberIdRoute.PATCH(jsonRequest(`/api/members/${owner._id}`, "PATCH", { role: "standard" }), ctx({ id: String(owner._id) }));
    expect(res.status).toBe(409);
  });

  it("400 for an invalid role", async () => {
    const res = await memberIdRoute.PATCH(jsonRequest(`/api/members/${standard._id}`, "PATCH", { role: "superuser" }), ctx({ id: String(standard._id) }));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/members/:id", () => {
  it("admin can remove a teammate", async () => {
    const res = await memberIdRoute.DELETE(jsonRequest(`/api/members/${standard._id}`, "DELETE"), ctx({ id: String(standard._id) }));
    expect(res.status).toBe(200);
    expect(await models.User.countDocuments({ _id: standard._id })).toBe(0);
  });

  it("409 when removing yourself", async () => {
    const res = await memberIdRoute.DELETE(jsonRequest(`/api/members/${owner._id}`, "DELETE"), ctx({ id: String(owner._id) }));
    expect(res.status).toBe(409);
  });

  it("409 when removing the workspace owner (as a different admin)", async () => {
    const otherAdmin = (await models.User.create({ workspaceId, name: "A2", email: "a2@x.com", role: "admin", status: "active" })).toObject() as IUser;
    session.user = otherAdmin;
    const res = await memberIdRoute.DELETE(jsonRequest(`/api/members/${owner._id}`, "DELETE"), ctx({ id: String(owner._id) }));
    expect(res.status).toBe(409);
  });

  it("403 for a standard user", async () => {
    session.user = standard;
    const res = await memberIdRoute.DELETE(jsonRequest(`/api/members/${owner._id}`, "DELETE"), ctx({ id: String(owner._id) }));
    expect(res.status).toBe(403);
  });
});
