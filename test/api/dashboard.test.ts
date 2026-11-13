import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import { jsonRequest } from "../helpers/api";
import type { IUser } from "@/lib/models";
import type { DashboardData } from "@/lib/types";

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

let workspaceId: Types.ObjectId;
let admin: IUser;
let standard: IUser;

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  dashboardRoute = await import("@/app/api/dashboard/route");
  await connectDB();
});
afterAll(stopTestDB);

beforeEach(async () => {
  await clearDB();
  workspaceId = new Types.ObjectId();
  admin = (await models.User.create({ workspaceId, name: "Riya Admin", email: "admin@x.com", role: "admin", status: "active" })).toObject() as IUser;
  standard = (await models.User.create({ workspaceId, name: "Neha Stan", email: "stan@x.com", role: "standard", status: "active" })).toObject() as IUser;
  session.user = admin;
});

const DAY = 86400000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

async function getDashboard(): Promise<DashboardData> {
  const res = await (dashboardRoute.GET as any)(jsonRequest("/api/dashboard", "GET"));
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/dashboard — Today page", () => {
  it("401s when signed out", async () => {
    session.user = null;
    const res = await (dashboardRoute.GET as any)(jsonRequest("/api/dashboard", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns open value, oldest untouched and latest lead per stage", async () => {
    const [old] = await models.Lead.create([
      { workspaceId, ownerId: admin._id, name: "Old", company: "OldCo", stage: "new", estValue: 1000, lastActivityAt: daysAgo(90) },
      { workspaceId, ownerId: admin._id, name: "Fresh", stage: "new", estValue: 2000, lastActivityAt: daysAgo(1) },
      { workspaceId, ownerId: admin._id, name: "Q", stage: "qualified", estValue: 500, lastActivityAt: daysAgo(1) },
      { workspaceId, ownerId: admin._id, name: "Winner", stage: "won", estValue: 9000, convertedAccountId: new Types.ObjectId() },
      { workspaceId, ownerId: admin._id, name: "Parked", stage: "parked", estValue: 7777 },
      { workspaceId, ownerId: admin._id, name: "Gone", stage: "new", estValue: 1, deletedAt: new Date() },
    ]);

    const d = await getDashboard();
    expect(d.openLeads).toBe(3);
    expect(d.openValue).toBe(3500); // won, parked and soft-deleted excluded
    expect(d.wonConverted).toBe(1);
    const stageNew = d.pipeline.find((p) => p.stage === "new")!;
    expect(stageNew).toMatchObject({ count: 2, value: 3000 });
    expect(stageNew.oldest).toMatchObject({ id: String(old._id), name: "Old", company: "OldCo" });
    expect(stageNew.latest?.name).toBe("Fresh");
    expect(d.pipeline.find((p) => p.stage === "proposal")).toMatchObject({ count: 0, value: 0, oldest: null, latest: null });
    expect(d.pipeline.find((p) => p.stage === "won")?.latest?.name).toBe("Winner");
    expect(new Date(d.asOf).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("builds an untruncated work queue of follow-ups, due reminders and overdue invoices, oldest first", async () => {
    const acc = await models.Account.create({ workspaceId, ownerId: standard._id, name: "Artha", status: "active", lastActivityAt: daysAgo(3) });
    for (let i = 0; i < 7; i++) {
      await models.Lead.create({ workspaceId, ownerId: standard._id, name: `Stale ${i}`, company: "Co", stage: "qualified", estValue: 100, lastActivityAt: daysAgo(10 + i) });
    }
    const covered = await models.Lead.create({ workspaceId, ownerId: admin._id, name: "Covered", stage: "proposal", estValue: 400, lastActivityAt: daysAgo(40) });
    await models.Lead.create({ workspaceId, ownerId: admin._id, name: "Recent", stage: "qualified", lastActivityAt: new Date() });

    const inv = await models.Invoice.create({ workspaceId, accountId: acc._id, number: 1016, amount: 18880, status: "overdue", dueAt: daysAgo(70) });
    await models.Invoice.create({ workspaceId, accountId: acc._id, number: 1017, amount: 50, status: "sent", dueAt: daysAgo(2) });
    await models.Invoice.create({ workspaceId, accountId: acc._id, number: 1018, amount: 60, status: "sent", dueAt: daysAhead(5) });

    const due = await models.Reminder.create({ workspaceId, userId: admin._id, title: "Send revised quote", dueAt: daysAgo(1), leadId: covered._id, entityLabel: "Covered" });
    await models.Reminder.create({ workspaceId, userId: admin._id, title: "Done already", dueAt: daysAgo(1), status: "done" });
    await models.Reminder.create({ workspaceId, userId: standard._id, title: "Someone else's", dueAt: daysAgo(1) });

    const d = await getDashboard();
    const kinds = d.queue.map((q) => q.kind);
    expect(kinds.filter((k) => k === "followup")).toHaveLength(7); // no cap; "Covered" suppressed by its reminder
    expect(kinds.filter((k) => k === "reminder")).toHaveLength(1);
    expect(kinds.filter((k) => k === "invoice")).toHaveLength(2); // overdue + sent past due; not the future one
    expect(d.queue.some((q) => q.title.includes("Covered"))).toBe(false);

    // Oldest first: the 70-day overdue invoice leads.
    expect(d.queue[0]).toMatchObject({
      kind: "invoice",
      invoiceId: String(inv._id),
      invoiceNumber: 1016,
      value: 18880,
      name: "Artha",
      ownerName: "Neha Stan",
      href: `/accounts/${acc._id}?tab=invoices`,
    });
    const times = d.queue.map((q) => new Date(q.kind === "followup" ? q.lastTouchedAt! : q.dueAt!).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    const reminder = d.queue.find((q) => q.kind === "reminder")!;
    expect(reminder).toMatchObject({
      reminderId: String(due._id),
      title: "Send revised quote",
      leadId: String(covered._id),
      stage: "proposal",
      value: 400,
      ownerName: "Riya Admin",
      href: `/leads/${covered._id}`,
    });

    const followup = d.queue.find((q) => q.kind === "followup")!;
    expect(followup).toMatchObject({ stage: "qualified", company: "Co", ownerName: "Neha Stan", value: 100 });
    expect(followup.title).toMatch(/^Call back Stale/);
  });

  it("summarises receivables: aging by due date (else issue date), debtors and collections", async () => {
    const big = await models.Account.create({ workspaceId, ownerId: admin._id, name: "Samarthya", status: "active" });
    const small = await models.Account.create({ workspaceId, ownerId: admin._id, name: "Brewtiful", status: "active" });
    const gone = await models.Account.create({ workspaceId, ownerId: admin._id, name: "Archived", status: "active", deletedAt: new Date() });
    await models.Invoice.create([
      { workspaceId, accountId: big._id, number: 1, amount: 1000, status: "sent", dueAt: daysAhead(10) },
      { workspaceId, accountId: big._id, number: 2, amount: 2000, status: "overdue", dueAt: daysAgo(10) },
      { workspaceId, accountId: small._id, number: 3, amount: 300, status: "sent", issuedAt: daysAgo(45) }, // no due date
      { workspaceId, accountId: small._id, number: 4, amount: 400, status: "overdue", dueAt: daysAgo(90) },
      { workspaceId, accountId: small._id, number: 5, amount: 50, status: "paid", paidAt: new Date(), issuedAt: daysAgo(40) },
      { workspaceId, accountId: small._id, number: 6, amount: 9, status: "draft" },
      { workspaceId, accountId: small._id, number: 7, amount: 5000, status: "sent", deletedAt: new Date() },
      { workspaceId, accountId: gone._id, number: 8, amount: 8000, status: "overdue", dueAt: daysAgo(5) },
    ]);

    const { receivables: r } = await getDashboard();
    expect(r.outstanding).toBe(3700);
    expect(r.billed).toBe(3750);
    expect(r.aging.map((b: { key: string; amount: number }) => [b.key, b.amount])).toEqual([["current", 1000], ["d30", 2000], ["d60", 300], ["d60plus", 400]]);
    expect(r.owingAccounts).toBe(2);
    expect(r.debtors).toEqual([
      { accountId: String(big._id), name: "Samarthya", amount: 3000, invoices: 2 },
      { accountId: String(small._id), name: "Brewtiful", amount: 700, invoices: 2 },
    ]);
    expect(r.collected).toMatchObject({ thisMonth: 50, payments: 1, latest: { accountId: String(small._id), accountName: "Brewtiful", number: 5 } });
  });

  it("lists the user's own reminders due later this week", async () => {
    const lead = await models.Lead.create({ workspaceId, ownerId: admin._id, name: "Ramkumar", stage: "qualified" });
    await models.Reminder.create([
      { workspaceId, userId: admin._id, title: "Later this week", dueAt: daysAhead(3), leadId: lead._id, entityLabel: "Ramkumar" },
      { workspaceId, userId: admin._id, title: "Next month", dueAt: daysAhead(30) },
      { workspaceId, userId: admin._id, title: "Canceled", dueAt: daysAhead(2), status: "canceled" },
      { workspaceId, userId: standard._id, title: "Not mine", dueAt: daysAhead(2) },
    ]);
    const d = await getDashboard();
    expect(d.upcoming).toHaveLength(1);
    expect(d.upcoming[0]).toMatchObject({ title: "Later this week", entityLabel: "Ramkumar", href: `/leads/${lead._id}` });
    expect(d.queue.filter((q) => q.kind === "reminder")).toHaveLength(0);
  });

  it("scopes the queue and receivables to a standard user's own records", async () => {
    const mine = await models.Account.create({ workspaceId, ownerId: standard._id, name: "Mine", status: "active" });
    const theirs = await models.Account.create({ workspaceId, ownerId: admin._id, name: "Theirs", status: "active" });
    await models.Invoice.create([
      { workspaceId, accountId: mine._id, number: 1, amount: 10, status: "overdue", dueAt: daysAgo(3) },
      { workspaceId, accountId: theirs._id, number: 2, amount: 99, status: "overdue", dueAt: daysAgo(3) },
    ]);
    await models.Lead.create([
      { workspaceId, ownerId: standard._id, name: "My stale", stage: "qualified", lastActivityAt: daysAgo(9) },
      { workspaceId, ownerId: admin._id, name: "Their stale", stage: "qualified", lastActivityAt: daysAgo(9) },
    ]);

    session.user = standard;
    const d = await getDashboard();
    expect(d.queue.map((q) => q.title).sort()).toEqual(["Call back My stale", "Chase payment from Mine"]);
    expect(d.receivables.outstanding).toBe(10);
    expect(d.receivables.debtors.map((x) => x.name)).toEqual(["Mine"]);
  });
});
