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
