import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import { jsonRequest, fakeUser } from "../helpers/api";
import type { IUser } from "@/lib/models";
import type { AuditAction, AuditEntity } from "@/lib/constants";

const session: { user: IUser | null } = { user: null };
vi.mock("@/lib/auth/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/server")>();
  return {
    ...actual,
    requireUser: vi.fn(async () => {
      if (!session.user) throw new actual.UnauthorizedError();
      return session.user;
    }),
  };
});

let models: typeof import("@/lib/models");
let auditRoute: typeof import("@/app/api/audit/route");

const workspaceId = new Types.ObjectId();
const admin = fakeUser({ workspaceId, name: "Riya", role: "admin" });
const other = fakeUser({ workspaceId, name: "Karan", role: "admin" });
const standard = fakeUser({ workspaceId, name: "Neha", role: "standard" });

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  auditRoute = await import("@/app/api/audit/route");
  await connectDB();
});
afterAll(stopTestDB);

beforeEach(async () => {
  await clearDB();
  session.user = admin;
  const entry = (actor: IUser, entity: AuditEntity, action: AuditAction, ws = workspaceId) => ({
    workspaceId: ws,
    entity,
    entityId: new Types.ObjectId(),
    entityLabel: `${entity} ${action}`,
    action,
    actorId: actor._id,
    actorName: actor.name,
  });
  await models.AuditLog.create([
    entry(admin, "lead", "create"),
    entry(admin, "account", "update"),
    entry(other, "lead", "delete"),
    entry(other, "invoice", "create"),
    entry(admin, "lead", "create", new Types.ObjectId()), // another workspace
  ]);
});

async function list(query = "") {
  const res = await auditRoute.GET(jsonRequest(`/api/audit${query}`, "GET"));
  return { status: res.status, body: await res.json() };
}

describe("GET /api/audit", () => {
  it("returns the workspace log, newest first, without other workspaces", async () => {
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(body.entries).toHaveLength(4);
    expect(body.entries[0]).not.toHaveProperty("_id");
  });

  it("403 for a standard user", async () => {
    session.user = standard;
    expect((await list()).status).toBe(403);
  });

  it("401 when signed out", async () => {
    session.user = null;
    expect((await list()).status).toBe(401);
  });

  it("filters by entity", async () => {
    const { body } = await list("?entity=lead");
    expect(body.entries.map((e: { entity: string }) => e.entity)).toEqual(["lead", "lead"]);
  });

  it("filters by action", async () => {
    const { body } = await list("?action=create");
    expect(body.entries).toHaveLength(2);
    expect(body.entries.every((e: { action: string }) => e.action === "create")).toBe(true);
  });

  it("filters by actor, combined with other filters", async () => {
    const { body } = await list(`?actorId=${other._id}&entity=lead`);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({ actorName: "Karan", entity: "lead", action: "delete" });
  });

  it("ignores unknown filter values", async () => {
    const { body } = await list("?entity=bogus&action=nope&actorId=not-an-id");
    expect(body.entries).toHaveLength(4);
  });

  it("honours ?limit", async () => {
    const { body } = await list("?limit=2");
    expect(body.entries).toHaveLength(2);
  });
});
