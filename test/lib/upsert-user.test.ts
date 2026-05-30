import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";

let connectDB: typeof import("@/lib/db").connectDB;
let upsertUserFromIdentity: typeof import("@/lib/auth/server").upsertUserFromIdentity;
let models: typeof import("@/lib/models");

beforeAll(async () => {
  await startTestDB();
  ({ connectDB } = await import("@/lib/db"));
  ({ upsertUserFromIdentity } = await import("@/lib/auth/server"));
  models = await import("@/lib/models");
  await connectDB();
});
afterAll(stopTestDB);
beforeEach(clearDB);

describe("upsertUserFromIdentity", () => {
  it("new email with NO existing domain workspace => admin, no workspace", async () => {
    const u = await upsertUserFromIdentity({ email: "First@New.com", name: "First", provider: "demo" });
    expect(u.role).toBe("admin");
    expect(u.workspaceId).toBeFalsy();
    expect(u.status).toBe("active");
    expect(u.email).toBe("first@new.com");
  });

  it("new email whose domain already has a workspace => standard, joined to it", async () => {
    const ws = await models.Workspace.create({ name: "Magick", ownerId: new Types.ObjectId(), domain: "magickvoice.com" });
    const u = await upsertUserFromIdentity({ email: "newbie@magickvoice.com", provider: "google" });
    expect(u.role).toBe("standard");
    expect(String(u.workspaceId)).toBe(String(ws._id));
    expect(u.status).toBe("active");
  });

  it("falls back to local-part of the email when no name given", async () => {
    const u = await upsertUserFromIdentity({ email: "jdoe@solo.com", provider: "demo" });
    expect(u.name).toBe("jdoe");
  });

  it("activates a previously-invited user on first sign-in, keeping role/workspace", async () => {
    const wsId = new Types.ObjectId();
    await models.User.create({
      workspaceId: wsId,
      name: "Invited",
      email: "invited@team.com",
      role: "standard",
      status: "invited",
      authProvider: "demo",
    });
    const u = await upsertUserFromIdentity({ email: "invited@team.com", provider: "google", firebaseUid: "uid-1" });
    expect(u.status).toBe("active");
    expect(u.role).toBe("standard");
    expect(String(u.workspaceId)).toBe(String(wsId));
    expect(u.firebaseUid).toBe("uid-1");
    expect(u.authProvider).toBe("google");
  });

  it("does not create a duplicate for an existing active user", async () => {
    await upsertUserFromIdentity({ email: "dup@x.com", provider: "demo" });
    await upsertUserFromIdentity({ email: "dup@x.com", provider: "google" });
    expect(await models.User.countDocuments({ email: "dup@x.com" })).toBe(1);
  });
});
