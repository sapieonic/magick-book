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
    getCurrentUser: vi.fn(async () => session.user),
  };
});

let models: typeof import("@/lib/models");
let dashboardRoute: typeof import("@/app/api/dashboard/route");
let moneyRoute: typeof import("@/app/api/money/route");

let workspaceId: Types.ObjectId;
let admin: IUser;
let standard: IUser;

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  dashboardRoute = await import("@/app/api/dashboard/route");
  moneyRoute = await import("@/app/api/money/route");
  await connectDB();
});
afterAll(stopTestDB);

beforeEach(async () => {
  await clearDB();
  workspaceId = new Types.ObjectId();
  admin = (await models.User.create({ workspaceId, name: "Admin", email: "admin@x.com", role: "admin", status: "active" })).toObject() as IUser;
  standard = (await models.User.create({ workspaceId, name: "Stan", email: "stan@x.com", role: "standard", status: "active" })).toObject() as IUser;
  session.user = admin;
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

describe("GET /api/dashboard", () => {
  it("computes KPI counts and pipeline buckets", async () => {
    await models.Lead.create([
      { workspaceId, ownerId: admin._id, name: "L1", stage: "new", estValue: 1000 },
      { workspaceId, ownerId: admin._id, name: "L2", stage: "qualified", estValue: 2000 },
      { workspaceId, ownerId: admin._id, name: "L3", stage: "qualified", estValue: 3000 },
      { workspaceId, ownerId: admin._id, name: "L4", stage: "won", estValue: 5000, lastActivityAt: new Date() },
      { workspaceId, ownerId: admin._id, name: "L5", stage: "lost", estValue: 100 },
    ]);
    await models.Account.create({ workspaceId, ownerId: admin._id, name: "A1", status: "active" });
    await models.Account.create({ workspaceId, ownerId: admin._id, name: "A2", status: "churned" });

    const data = await (await dashboardRoute.GET(jsonRequest("/api/dashboard", "GET"))).json();
    expect(data.openLeads).toBe(3); // new + 2 qualified (won/lost excluded)
    expect(data.qualified).toBe(2);
    expect(data.wonThisMonth).toBe(1);
    expect(data.activeAccounts).toBe(1);

    const qualifiedBucket = data.pipeline.find((p: { stage: string }) => p.stage === "qualified");
    expect(qualifiedBucket.count).toBe(2);
    expect(qualifiedBucket.value).toBe(5000);
  });

  it("computes revenue this-month vs last and the delta pct", async () => {
    const acc = await models.Account.create({ workspaceId, ownerId: admin._id, name: "A", status: "active" });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    await models.Invoice.create([
      { workspaceId, accountId: acc._id, number: 1, amount: 2000, status: "sent", issuedAt: new Date(monthStart.getTime() + 86400000) },
      { workspaceId, accountId: acc._id, number: 2, amount: 1000, status: "paid", issuedAt: lastMonth },
      { workspaceId, accountId: acc._id, number: 3, amount: 9999, status: "draft", issuedAt: now }, // drafts excluded
    ]);
    const data = await (await dashboardRoute.GET(jsonRequest("/api/dashboard", "GET"))).json();
    expect(data.revenueThisMonth).toBe(2000);
    expect(data.revenueDeltaPct).toBe(100); // (2000-1000)/1000
  });

  it("surfaces an overdue invoice and a stale qualified/proposal lead in attention", async () => {
    const acc = await models.Account.create({ workspaceId, ownerId: admin._id, name: "Lumen", status: "active" });
    await models.Invoice.create({ workspaceId, accountId: acc._id, number: 1, amount: 5000, status: "overdue", dueAt: daysAgo(10) });
    await models.Lead.create({ workspaceId, ownerId: admin._id, name: "Stale Lead", stage: "qualified", lastActivityAt: daysAgo(5) });
    await models.Lead.create({ workspaceId, ownerId: admin._id, name: "Fresh Lead", stage: "qualified", lastActivityAt: new Date() });

    const data = await (await dashboardRoute.GET(jsonRequest("/api/dashboard", "GET"))).json();
    const kinds = data.attention.map((a: { kind: string }) => a.kind);
    expect(kinds).toContain("invoice_overdue");
    expect(kinds).toContain("lead_followup");
    const followups = data.attention.filter((a: { kind: string }) => a.kind === "lead_followup");
    expect(followups).toHaveLength(1); // only the stale one
    expect(followups[0].title).toContain("Stale Lead");
  });

  it("scopes to the standard user's own data", async () => {
    await models.Lead.create({ workspaceId, ownerId: admin._id, name: "AdminLead", stage: "new" });
    await models.Lead.create({ workspaceId, ownerId: standard._id, name: "StanLead", stage: "new" });
    session.user = standard;
    const data = await (await dashboardRoute.GET(jsonRequest("/api/dashboard", "GET"))).json();
    expect(data.openLeads).toBe(1);
  });
});

describe("GET /api/money", () => {
  it("totals billed/paid/outstanding/expenses across visible accounts", async () => {
    const acc = await models.Account.create({ workspaceId, ownerId: admin._id, name: "A", status: "active" });
    await models.Invoice.create([
      { workspaceId, accountId: acc._id, number: 1, amount: 1000, status: "paid" },
      { workspaceId, accountId: acc._id, number: 2, amount: 500, status: "sent" },
      { workspaceId, accountId: acc._id, number: 3, amount: 250, status: "overdue" },
      { workspaceId, accountId: acc._id, number: 4, amount: 9999, status: "draft" }, // excluded from billed
    ]);
    await models.Expense.create({ workspaceId, accountId: acc._id, amount: 300, category: "Software", vendor: "X" });

    const body = await (await moneyRoute.GET(jsonRequest("/api/money", "GET"))).json();
    expect(body.totals.billed).toBe(1750); // 1000+500+250
    expect(body.totals.paid).toBe(1000);
    expect(body.totals.outstanding).toBe(750);
    expect(body.totals.expenses).toBe(300);
    expect(body.invoices).toHaveLength(4);
    expect(body.invoices[0].accountName).toBe("A");
  });

  it("scopes money to the standard user's own accounts", async () => {
    const adminAcc = await models.Account.create({ workspaceId, ownerId: admin._id, name: "AdminAcc", status: "active" });
    const stanAcc = await models.Account.create({ workspaceId, ownerId: standard._id, name: "StanAcc", status: "active" });
    await models.Invoice.create({ workspaceId, accountId: adminAcc._id, number: 1, amount: 1000, status: "paid" });
    await models.Invoice.create({ workspaceId, accountId: stanAcc._id, number: 2, amount: 7, status: "paid" });

    session.user = standard;
    const body = await (await moneyRoute.GET(jsonRequest("/api/money", "GET"))).json();
    expect(body.totals.paid).toBe(7);
    expect(body.invoices).toHaveLength(1);
  });
});
