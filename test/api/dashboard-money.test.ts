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
      { workspaceId, ownerId: admin._id, name: "L6", stage: "parked", estValue: 9999 },
    ]);
    await models.Account.create({ workspaceId, ownerId: admin._id, name: "A1", status: "active" });
    await models.Account.create({ workspaceId, ownerId: admin._id, name: "A2", status: "churned" });

    const data = await (await (dashboardRoute.GET as any)(jsonRequest("/api/dashboard", "GET"))).json();
    expect(data.openLeads).toBe(3); // new + 2 qualified (won/lost/parked excluded)
    expect(data.qualified).toBe(2);
    expect(data.wonThisMonth).toBe(1);
    expect(data.activeAccounts).toBe(1);
    expect(data.pipeline.map((p: { stage: string }) => p.stage)).toEqual(["new", "contacted", "qualified", "proposal", "won"]);
    expect(data.pipeline.find((p: { stage: string }) => p.stage === "parked")).toBeUndefined();

    const qualifiedBucket = data.pipeline.find((p: { stage: string }) => p.stage === "qualified");
    expect(qualifiedBucket.count).toBe(2);
    expect(qualifiedBucket.value).toBe(5000);
  });

  it("scopes to the standard user's own data", async () => {
    await models.Lead.create({ workspaceId, ownerId: admin._id, name: "AdminLead", stage: "new" });
    await models.Lead.create({ workspaceId, ownerId: standard._id, name: "StanLead", stage: "new" });
    session.user = standard;
    const data = await (await (dashboardRoute.GET as any)(jsonRequest("/api/dashboard", "GET"))).json();
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

    const body = await (await (moneyRoute.GET as any)(jsonRequest("/api/money", "GET"))).json();
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
    const body = await (await (moneyRoute.GET as any)(jsonRequest("/api/money", "GET"))).json();
    expect(body.totals.paid).toBe(7);
    expect(body.invoices).toHaveLength(1);
  });

  it("excludes soft-deleted invoices and expenses from totals", async () => {
    const acc = await models.Account.create({ workspaceId, ownerId: admin._id, name: "A", status: "active" });
    await models.Invoice.create([
      { workspaceId, accountId: acc._id, number: 1, amount: 1000, status: "paid" },
      { workspaceId, accountId: acc._id, number: 2, amount: 500, status: "sent", deletedAt: new Date(), deletedBy: admin._id },
    ]);
    await models.Expense.create([
      { workspaceId, accountId: acc._id, amount: 100, category: "Software", vendor: "X" },
      { workspaceId, accountId: acc._id, amount: 999, category: "Travel", vendor: "Y", deletedAt: new Date(), deletedBy: admin._id },
    ]);

    const body = await (await (moneyRoute.GET as any)(jsonRequest("/api/money", "GET"))).json();
    expect(body.invoices).toHaveLength(1);
    expect(body.expenses).toHaveLength(1);
    expect(body.totals.paid).toBe(1000);
    expect(body.totals.outstanding).toBe(0);
    expect(body.totals.expenses).toBe(100);
  });

  it("returns counts, aging bands and the collected-by-month series", async () => {
    const acme = await models.Account.create({ workspaceId, ownerId: admin._id, name: "Acme", status: "active" });
    const lumen = await models.Account.create({ workspaceId, ownerId: admin._id, name: "Lumen", status: "active" });
    await models.Invoice.create([
      { workspaceId, accountId: acme._id, number: 1, amount: 100, status: "sent", issuedAt: daysAgo(5), dueAt: daysAgo(-5) },
      { workspaceId, accountId: acme._id, number: 2, amount: 200, status: "sent", issuedAt: daysAgo(30), dueAt: daysAgo(10) },
      { workspaceId, accountId: lumen._id, number: 3, amount: 300, status: "overdue", issuedAt: daysAgo(90), dueAt: daysAgo(75) },
      { workspaceId, accountId: lumen._id, number: 4, amount: 400, status: "paid", issuedAt: daysAgo(3), paidAt: new Date() },
    ]);

    const body = await (await (moneyRoute.GET as any)(jsonRequest("/api/money", "GET"))).json();
    expect(Date.parse(body.asOf)).not.toBeNaN();
    expect(body.totals).toMatchObject({ billedCount: 4, paidCount: 1, outstandingCount: 3, overdueCount: 2, outstanding: 600 });

    const band = (key: string) => body.aging.find((b: { key: string }) => b.key === key);
    expect(band("current")).toMatchObject({ amount: 100, count: 1, accounts: ["Acme"] });
    expect(band("d30")).toMatchObject({ amount: 200, count: 1 });
    expect(band("d60")).toMatchObject({ amount: 0, count: 0, accounts: [] });
    expect(band("d60plus")).toMatchObject({ amount: 300, count: 1, accounts: ["Lumen"] });

    expect(body.collected.months).toHaveLength(6);
    expect(body.collected.total).toBe(400);
    expect(body.collected.series).toEqual([{ key: String(lumen._id), name: "Lumen", total: 400 }]);
    expect(body.collected.months.at(-1)).toMatchObject({ total: 400, amounts: [400] });
    expect(body.invoices.find((i: { number: number }) => i.number === 2).dueAt).toBeTruthy();
  });

  it("scopes aging and collections to the standard user's accounts", async () => {
    const adminAcc = await models.Account.create({ workspaceId, ownerId: admin._id, name: "AdminAcc", status: "active" });
    const stanAcc = await models.Account.create({ workspaceId, ownerId: standard._id, name: "StanAcc", status: "active" });
    await models.Invoice.create([
      { workspaceId, accountId: adminAcc._id, number: 1, amount: 1000, status: "overdue", dueAt: daysAgo(10) },
      { workspaceId, accountId: adminAcc._id, number: 2, amount: 1000, status: "paid", paidAt: new Date() },
      { workspaceId, accountId: stanAcc._id, number: 3, amount: 7, status: "overdue", dueAt: daysAgo(10) },
    ]);

    session.user = standard;
    const body = await (await (moneyRoute.GET as any)(jsonRequest("/api/money", "GET"))).json();
    expect(body.aging.find((b: { key: string }) => b.key === "d30")).toMatchObject({ amount: 7, count: 1, accounts: ["StanAcc"] });
    expect(body.collected.total).toBe(0);
    expect(body.collected.series).toEqual([]);
  });

  it("rejects signed-out requests", async () => {
    session.user = null;
    const res = await (moneyRoute.GET as any)(jsonRequest("/api/money", "GET"));
    expect(res.status).toBe(401);
  });
});

describe("aging agrees across /api/dashboard and /api/money", () => {
  it("puts every invoice in the same band on both endpoints", async () => {
    const acc = await models.Account.create({ workspaceId, ownerId: admin._id, name: "Acme", status: "active" });
    await models.Invoice.create([
      { workspaceId, accountId: acc._id, number: 1, amount: 100, status: "sent", dueAt: daysAgo(-3) },
      { workspaceId, accountId: acc._id, number: 2, amount: 200, status: "sent", dueAt: daysAgo(1) },
      { workspaceId, accountId: acc._id, number: 3, amount: 400, status: "sent", issuedAt: daysAgo(45) }, // no due date: ages from issue
      { workspaceId, accountId: acc._id, number: 4, amount: 800, status: "overdue", dueAt: daysAgo(61) },
    ]);
    const dash = await (await (dashboardRoute.GET as any)(jsonRequest("/api/dashboard", "GET"))).json();
    const money = await (await (moneyRoute.GET as any)(jsonRequest("/api/money", "GET"))).json();
    const amounts = (aging: { key: string; amount: number }[]) => aging.map((b) => [b.key, b.amount]);
    expect(amounts(dash.receivables.aging)).toEqual([["current", 100], ["d30", 200], ["d60", 400], ["d60plus", 800]]);
    expect(amounts(money.aging)).toEqual(amounts(dash.receivables.aging));
    // "Overdue" is the same set everywhere: the queue's invoices are the non-current bands.
    expect(dash.queue.filter((q: { kind: string }) => q.kind === "invoice")).toHaveLength(3);
    expect(money.totals).toMatchObject({ overdueCount: 3, overdue: 1400 });
  });
});
