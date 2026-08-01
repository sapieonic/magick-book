import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import { jsonRequest } from "../helpers/api";
import type { IUser } from "@/lib/models";
import { DEFAULT_LEAD_CATEGORIES } from "@/lib/constants";

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
let categoriesRoute: typeof import("@/app/api/workspace/categories/route");

let workspaceId: Types.ObjectId;
let admin: IUser;
let standard: IUser;

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  categoriesRoute = await import("@/app/api/workspace/categories/route");
  await connectDB();
});
afterAll(stopTestDB);

beforeEach(async () => {
  await clearDB();
  workspaceId = new Types.ObjectId();
  await models.Workspace.create({
    _id: workspaceId,
    name: "Acme",
    ownerId: new Types.ObjectId(),
    leadCategories: [...DEFAULT_LEAD_CATEGORIES],
  });
  admin = (await models.User.create({ workspaceId, name: "Admin", email: "admin@x.com", role: "admin", status: "active" })).toObject() as IUser;
  standard = (await models.User.create({ workspaceId, name: "Stan", email: "stan@x.com", role: "standard", status: "active" })).toObject() as IUser;
  session.user = admin;
});

describe("GET /api/workspace/categories", () => {
  it("returns the workspace taxonomy for any member", async () => {
    session.user = standard;
    const res = await categoriesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toEqual([...DEFAULT_LEAD_CATEGORIES]);
    expect(body.counts).toBeTruthy();
    expect(body.orphans).toEqual([]);
    expect(body.isAdmin).toBe(false);
  });

  it("reports usage counts and orphaned categories after a remove", async () => {
    await models.Lead.create({
      workspaceId,
      ownerId: admin._id,
      name: "A",
      source: "Website",
      stage: "new",
      category: "finance",
    });
    await models.Lead.create({
      workspaceId,
      ownerId: admin._id,
      name: "B",
      source: "Website",
      stage: "new",
      category: "finance",
    });
    await categoriesRoute.PUT(
      jsonRequest("/api/workspace/categories", "PUT", {
        categories: ["unclassified", "automobile"],
      }),
    );
    const res = await categoriesRoute.GET();
    const body = await res.json();
    expect(body.categories).toEqual(["unclassified", "automobile"]);
    expect(body.orphans).toEqual([{ category: "finance", count: 2 }]);
  });
});

describe("PUT /api/workspace/categories", () => {
  it("lets admins replace the list and keeps unclassified first", async () => {
    const res = await categoriesRoute.PUT(
      jsonRequest("/api/workspace/categories", "PUT", { categories: ["finance", "telecom", "unclassified"] }),
    );
    expect(res.status).toBe(200);
    const { categories } = await res.json();
    expect(categories[0]).toBe("unclassified");
    expect(categories).toEqual(["unclassified", "finance", "telecom"]);
  });

  it("normalizes slugs and dedupes", async () => {
    const res = await categoriesRoute.PUT(
      jsonRequest("/api/workspace/categories", "PUT", { categories: ["  Auto Mobile ", "AUTO MOBILE", "Finance"] }),
    );
    const { categories } = await res.json();
    expect(categories).toEqual(["unclassified", "auto mobile", "finance"]);
  });

  it("forbids standard users from editing", async () => {
    session.user = standard;
    const res = await categoriesRoute.PUT(
      jsonRequest("/api/workspace/categories", "PUT", { categories: ["unclassified", "finance"] }),
    );
    expect(res.status).toBe(403);
  });
});
