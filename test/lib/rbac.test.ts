import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { isAdmin, leadScope, accountScope, canEditOwned } from "@/lib/rbac";
import type { IUser } from "@/lib/models";

function makeUser(role: "admin" | "standard"): IUser {
  return {
    _id: new Types.ObjectId(),
    workspaceId: new Types.ObjectId(),
    name: "Test",
    email: "test@x.com",
    authProvider: "demo",
    role,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as IUser;
}

describe("isAdmin", () => {
  it("is true only for admins", () => {
    expect(isAdmin(makeUser("admin"))).toBe(true);
    expect(isAdmin(makeUser("standard"))).toBe(false);
  });
});

describe("leadScope / accountScope", () => {
  it("admin scope pins workspace but omits ownerId", () => {
    const u = makeUser("admin");
    expect(leadScope(u)).toEqual({ workspaceId: u.workspaceId });
    expect(accountScope(u)).toEqual({ workspaceId: u.workspaceId });
    expect("ownerId" in leadScope(u)).toBe(false);
  });
  it("standard scope pins workspace AND ownerId", () => {
    const u = makeUser("standard");
    expect(leadScope(u)).toEqual({ workspaceId: u.workspaceId, ownerId: u._id });
    expect(accountScope(u)).toEqual({ workspaceId: u.workspaceId, ownerId: u._id });
  });
});

describe("canEditOwned", () => {
  it("admins can edit anything", () => {
    const u = makeUser("admin");
    expect(canEditOwned(u, new Types.ObjectId())).toBe(true);
  });
  it("standard users can edit only records they own", () => {
    const u = makeUser("standard");
    expect(canEditOwned(u, u._id)).toBe(true);
    expect(canEditOwned(u, new Types.ObjectId())).toBe(false);
  });
});
