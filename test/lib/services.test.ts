import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";

// IMPORTANT: import app modules only AFTER MONGODB_URI is pointed at the
// memory server, so connectDB() can never reach the real Atlas cluster.
let connectDB: typeof import("@/lib/db").connectDB;
let services: typeof import("@/lib/services");
let models: typeof import("@/lib/models");

beforeAll(async () => {
  await startTestDB();
  ({ connectDB } = await import("@/lib/db"));
  services = await import("@/lib/services");
  models = await import("@/lib/models");
  await connectDB();
});
afterAll(stopTestDB);
beforeEach(clearDB);

const ws = () => new Types.ObjectId();

describe("accountFinance", () => {
  it("returns all zeros and zero margin for an account with no invoices", async () => {
    const accId = new Types.ObjectId();
    const fin = await services.accountFinance(accId);
    expect(fin).toEqual({ billed: 0, paid: 0, outstanding: 0, overdue: 0, expenses: 0, margin: 0 });
  });

  it("computes billed=sent+paid+overdue, paid, outstanding, expenses and margin", async () => {
    const workspaceId = ws();
    const accountId = new Types.ObjectId();
    await models.Invoice.create([
      { workspaceId, accountId, number: 1, amount: 1000, status: "draft" }, // excluded from billed
      { workspaceId, accountId, number: 2, amount: 2000, status: "sent" },
      { workspaceId, accountId, number: 3, amount: 3000, status: "paid" },
      { workspaceId, accountId, number: 4, amount: 1500, status: "overdue" },
    ]);
    await models.Expense.create([
      { workspaceId, accountId, amount: 1300, category: "Software", vendor: "X" },
      { workspaceId, accountId, amount: 700, category: "Travel", vendor: "Y" },
    ]);

    const fin = await services.accountFinance(accountId);
    expect(fin.billed).toBe(6500); // 2000 + 3000 + 1500
    expect(fin.paid).toBe(3000);
    expect(fin.outstanding).toBe(3500); // sent + overdue
    expect(fin.expenses).toBe(2000);
    expect(fin.margin).toBeCloseTo((6500 - 2000) / 6500, 5);
  });

  it("lets margin go negative when expenses exceed billings", async () => {
    const workspaceId = ws();
    const accountId = new Types.ObjectId();
    await models.Invoice.create({ workspaceId, accountId, number: 1, amount: 1000, status: "paid" });
    await models.Expense.create({ workspaceId, accountId, amount: 5000, category: "Other", vendor: "Z" });
    const fin = await services.accountFinance(accountId);
    expect(fin.margin).toBe(-4);
  });

  it("folds many invoices per account in one pass", async () => {
    const workspaceId = ws();
    const [a, b] = [new Types.ObjectId(), new Types.ObjectId()];
    await models.Invoice.create(
      Array.from({ length: 6 }, (_, i) => ({ workspaceId, accountId: i % 2 ? a : b, number: i + 1, amount: 100 * (i + 1), status: "paid" as const })),
    );
    const fin = await services.accountFinances([a, b]);
    expect(fin.get(String(a))!.billed).toBe(200 + 400 + 600);
    expect(fin.get(String(b))!.billed).toBe(100 + 300 + 500);
  });

  it("excludes soft-deleted invoices from billed/paid/outstanding", async () => {
    const workspaceId = ws();
    const accountId = new Types.ObjectId();
    await models.Invoice.create([
      { workspaceId, accountId, number: 1, amount: 2000, status: "sent" },
      { workspaceId, accountId, number: 2, amount: 3000, status: "paid", deletedAt: new Date() },
    ]);
    const fin = await services.accountFinance(accountId);
    expect(fin.billed).toBe(2000);
    expect(fin.paid).toBe(0);
    expect(fin.outstanding).toBe(2000);
  });

  it("accepts a string account id", async () => {
    const accountId = new Types.ObjectId();
    const fin = await services.accountFinance(String(accountId));
    expect(fin.billed).toBe(0);
  });
});

describe("accountFinances aggregation matches rollupMoney", () => {
  // Deterministic PRNG (mulberry32), so a failure reproduces.
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // IST midnight, the instants either side of it, and plain days around it.
  const nows = [
    new Date("2026-11-14T18:30:00.000Z"), // exactly 00:00 IST on the 15th
    new Date("2026-11-14T18:29:59.999Z"), // 23:59:59.999 IST on the 14th
    new Date("2026-11-14T06:12:00.000Z"),
    new Date("2026-03-31T19:00:00.000Z"),
  ];

  it.each(nows.map((now) => [now.toISOString(), now] as const))("now = %s", async (_label, now) => {
    const { rollupMoney } = await import("@/lib/receivables");
    const { businessDay, DAY_MS } = await import("@/lib/dates");
    const { INVOICE_STATUSES } = await import("@/lib/constants");
    const rand = rng(now.getTime() % 100_000);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
    const midnight = businessDay(now).getTime();
    // Edges around today's and yesterday's IST midnight, plus random times ±90 days.
    const edge = [midnight - 1, midnight, midnight + 1, midnight - DAY_MS - 1, midnight - DAY_MS, now.getTime(), now.getTime() + 1];
    const when = () => new Date(rand() < 0.4 ? pick(edge) : now.getTime() + Math.round((rand() - 0.6) * 90 * DAY_MS));

    const workspaceId = ws();
    const accounts = Array.from({ length: 10 }, () => new Types.ObjectId());
    const invoices = Array.from({ length: 400 }, (_, i) => {
      const dueMode = rand();
      return {
        workspaceId,
        accountId: pick(accounts.slice(0, 7)), // accounts 8 to 10: billed little, expenses only, nothing
        number: i + 1,
        amount: 1 + Math.floor(rand() * 100_000),
        status: pick(INVOICE_STATUSES),
        issuedAt: when(),
        ...(dueMode < 0.25 ? {} : dueMode < 0.4 ? { dueAt: null } : { dueAt: when() }),
        ...(rand() < 0.1 ? { deletedAt: when() } : {}),
      };
    });
    invoices.push({ workspaceId, accountId: accounts[7], number: 999, amount: 100, status: "sent", issuedAt: when() });
    const expenses = Array.from({ length: 80 }, () => ({
      workspaceId,
      accountId: pick(accounts.slice(2)),
      amount: 1 + Math.floor(rand() * 150_000),
      category: "Other",
      ...(rand() < 0.1 ? { deletedAt: when() } : {}),
    }));
    await models.Invoice.insertMany(invoices);
    await models.Expense.insertMany(expenses);

    const fin = await services.accountFinances(accounts, now);
    for (const acc of accounts) {
      const mine = <T extends { accountId: Types.ObjectId; deletedAt?: Date }>(rows: T[]) =>
        rows.filter((r) => r.accountId.equals(acc) && !r.deletedAt);
      const { billed, paid, outstanding, overdue, expenses: spent, margin } = rollupMoney(mine(invoices), mine(expenses), now);
      expect(fin.get(String(acc)) ?? services.NO_FINANCE).toEqual({ billed, paid, outstanding, overdue, expenses: spent, margin });
    }
    // The fixture really exercises overdue, negative margin and expense-only accounts.
    const rows = [...fin.values()];
    expect(rows.some((f) => f.overdue > 0 && f.overdue < f.outstanding)).toBe(true);
    expect(rows.some((f) => f.margin < 0)).toBe(true);
    expect(rows.some((f) => f.billed === 0 && f.expenses > 0 && f.margin === 0)).toBe(true);
  });

  it("an invoice due exactly at today's IST midnight is not overdue; one due a millisecond earlier is", async () => {
    const now = new Date("2026-11-14T06:00:00.000Z"); // 11:30 IST
    const workspaceId = ws();
    const [onTime, late, marked, noDue] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    await models.Invoice.create([
      { workspaceId, accountId: onTime, number: 1, amount: 100, status: "sent", dueAt: new Date("2026-11-13T18:30:00.000Z") },
      { workspaceId, accountId: late, number: 2, amount: 100, status: "sent", dueAt: new Date("2026-11-13T18:29:59.999Z") },
      { workspaceId, accountId: marked, number: 3, amount: 100, status: "overdue", dueAt: new Date("2026-12-01T00:00:00.000Z") },
      { workspaceId, accountId: noDue, number: 4, amount: 100, status: "sent", issuedAt: new Date("2026-11-13T18:29:59.999Z") },
    ]);
    const fin = await services.accountFinances([onTime, late, marked, noDue], now);
    expect([onTime, late, marked, noDue].map((a) => fin.get(String(a))!.overdue)).toEqual([0, 100, 100, 100]);
  });
});

describe("nextInvoiceNumber", () => {
  it("starts at 1001 for an empty workspace", async () => {
    expect(await services.nextInvoiceNumber(ws())).toBe(1001);
  });

  it("increments off the highest existing number, scoped per workspace", async () => {
    const a = ws();
    const b = ws();
    await models.Invoice.create([
      { workspaceId: a, accountId: new Types.ObjectId(), number: 1001, amount: 1, status: "sent" },
      { workspaceId: a, accountId: new Types.ObjectId(), number: 1005, amount: 1, status: "sent" },
      { workspaceId: b, accountId: new Types.ObjectId(), number: 2000, amount: 1, status: "sent" },
    ]);
    expect(await services.nextInvoiceNumber(a)).toBe(1006);
    expect(await services.nextInvoiceNumber(b)).toBe(2001);
    expect(await services.nextInvoiceNumber(ws())).toBe(1001);
  });
});

describe("ownerNameMap", () => {
  it("resolves ids to names and dedupes", async () => {
    const u1 = await models.User.create({ name: "Ada", email: "ada@x.com" });
    const u2 = await models.User.create({ name: "Bob", email: "bob@x.com" });
    const map = await services.ownerNameMap([u1._id, u2._id, u1._id]);
    expect(map.get(String(u1._id))).toBe("Ada");
    expect(map.get(String(u2._id))).toBe("Bob");
    expect(map.size).toBe(2);
  });
  it("returns an empty map for no ids", async () => {
    expect((await services.ownerNameMap([])).size).toBe(0);
  });
});

describe("logActivity", () => {
  it("persists an activity row", async () => {
    const workspaceId = ws();
    const leadId = new Types.ObjectId();
    await services.logActivity({ workspaceId, leadId, kind: "note", title: "Note added", detail: "hi" });
    const rows = await models.Activity.find({ leadId }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("note");
    expect(rows[0].title).toBe("Note added");
  });
});

describe("expenseFields", () => {
  it("reads only the fields present", () => {
    expect(services.expenseFields({})).toEqual({});
    expect(services.expenseFields({ amount: "250", vendor: "  Uber ", billable: true, date: "2026-11-13" })).toEqual({
      amount: 250,
      vendor: "Uber",
      billable: true,
      date: new Date("2026-11-13"),
    });
  });

  it.each([
    [{ amount: 0 }, "A positive amount is required"],
    [{ amount: -5 }, "A positive amount is required"],
    [{ amount: "Infinity" }, "A positive amount is required"],
    [{ amount: "abc" }, "A positive amount is required"],
    [{ date: null }, "A valid date is required"],
    [{ date: 0 }, "A valid date is required"],
    [{ date: "not a date" }, "A valid date is required"],
    [{ vendor: "x".repeat(201) }, "Keep the vendor or note to 200 characters"],
  ])("rejects %j", (body, message) => {
    expect(() => services.expenseFields(body)).toThrow(message);
  });

  it("accepts a vendor of exactly the maximum length", () => {
    expect(services.expenseFields({ vendor: "x".repeat(200) }).vendor).toHaveLength(200);
  });
});
