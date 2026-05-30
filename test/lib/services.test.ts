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
    expect(fin).toEqual({ billed: 0, paid: 0, outstanding: 0, expenses: 0, margin: 0 });
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

  it("clamps margin to 0 when expenses exceed billings", async () => {
    const workspaceId = ws();
    const accountId = new Types.ObjectId();
    await models.Invoice.create({ workspaceId, accountId, number: 1, amount: 1000, status: "paid" });
    await models.Expense.create({ workspaceId, accountId, amount: 5000, category: "Other", vendor: "Z" });
    const fin = await services.accountFinance(accountId);
    expect(fin.margin).toBe(0);
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
