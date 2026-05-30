import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import { jsonRequest } from "../helpers/api";
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
    // Re-read the (possibly mutated) user from the DB for the response.
    getSessionUser: vi.fn(async () => {
      if (!session.user) return null;
      const { User } = await import("@/lib/models");
      const u = await User.findById(session.user._id).lean<IUser>();
      return u ? { id: String(u._id), name: u.name, email: u.email, role: u.role, status: u.status, authProvider: u.authProvider, workspaceId: u.workspaceId ? String(u.workspaceId) : null, workspaceName: null } : null;
    }),
  };
});

let models: typeof import("@/lib/models");
let workspaceRoute: typeof import("@/app/api/workspace/route");

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  workspaceRoute = await import("@/app/api/workspace/route");
  await connectDB();
});
afterAll(stopTestDB);
beforeEach(clearDB);

describe("POST /api/workspace (onboarding)", () => {
  it("first user creates a workspace stamped with the email domain and becomes admin", async () => {
    const user = (await models.User.create({ name: "First", email: "first@acme.com", role: "admin", status: "active" })).toObject() as IUser;
    session.user = user;

    const res = await workspaceRoute.POST(jsonRequest("/api/workspace", "POST", { name: "Acme CRM", businessTypes: ["saas"] }));
    expect(res.status).toBe(200);
    const ws = await models.Workspace.findOne({ domain: "acme.com" }).lean();
    expect(ws?.name).toBe("Acme CRM");
    expect(String(ws?.ownerId)).toBe(String(user._id));

    const fresh = await models.User.findById(user._id).lean();
    expect(fresh?.role).toBe("admin");
    expect(String(fresh?.workspaceId)).toBe(String(ws?._id));
  });

  it("requires a workspace name", async () => {
    session.user = (await models.User.create({ name: "X", email: "x@acme.com", role: "admin", status: "active" })).toObject() as IUser;
    const res = await workspaceRoute.POST(jsonRequest("/api/workspace", "POST", { name: "  " }));
    expect(res.status).toBe(400);
  });

  it("race guard: joins an existing domain workspace as standard instead of duplicating", async () => {
    const ownerId = new Types.ObjectId();
    const existing = await models.Workspace.create({ name: "Existing Acme", ownerId, domain: "acme.com" });
    const user = (await models.User.create({ name: "Second", email: "second@acme.com", role: "admin", status: "active" })).toObject() as IUser;
    session.user = user;

    await workspaceRoute.POST(jsonRequest("/api/workspace", "POST", { name: "Duplicate" }));

    expect(await models.Workspace.countDocuments({ domain: "acme.com" })).toBe(1);
    const fresh = await models.User.findById(user._id).lean();
    expect(String(fresh?.workspaceId)).toBe(String(existing._id));
    expect(fresh?.role).toBe("standard");
  });

  it("renames the workspace when the user already belongs to one", async () => {
    const ws = await models.Workspace.create({ name: "Old", ownerId: new Types.ObjectId(), domain: "acme.com" });
    const user = (await models.User.create({ name: "U", email: "u@acme.com", role: "admin", status: "active", workspaceId: ws._id })).toObject() as IUser;
    session.user = user;
    await workspaceRoute.POST(jsonRequest("/api/workspace", "POST", { name: "Renamed" }));
    expect((await models.Workspace.findById(ws._id).lean())?.name).toBe("Renamed");
  });
});
