import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";

let connectDB: typeof import("@/lib/db").connectDB;
let models: typeof import("@/lib/models");

beforeAll(async () => {
  await startTestDB();
  ({ connectDB } = await import("@/lib/db"));
  models = await import("@/lib/models");
  await connectDB();
});
afterAll(stopTestDB);
beforeEach(clearDB);

describe("model validation", () => {
  it("Lead requires workspaceId, ownerId and name", async () => {
    await expect(models.Lead.create({})).rejects.toThrow();
    await expect(
      models.Lead.create({ workspaceId: new Types.ObjectId(), ownerId: new Types.ObjectId(), name: "X" }),
    ).resolves.toBeTruthy();
  });

  it("Invoice requires number and amount", async () => {
    await expect(
      models.Invoice.create({ workspaceId: new Types.ObjectId(), accountId: new Types.ObjectId() }),
    ).rejects.toThrow();
  });

  it("User requires name and email", async () => {
    await expect(models.User.create({})).rejects.toThrow();
  });

  it("enforces the unique email index", async () => {
    // Mongoose builds indexes asynchronously; wait for the unique email index to
    // finish building before relying on it, otherwise the duplicate insert races
    // the index creation and is intermittently accepted.
    await models.User.init();
    await models.User.create({ name: "A", email: "dup@x.com" });
    await expect(models.User.create({ name: "B", email: "dup@x.com" })).rejects.toThrow();
  });
});

describe("schema defaults", () => {
  it("Lead defaults stage=new, source=Website, estValue=0, tags=[]", async () => {
    const lead = await models.Lead.create({
      workspaceId: new Types.ObjectId(),
      ownerId: new Types.ObjectId(),
      name: "X",
    });
    expect(lead.stage).toBe("new");
    expect(lead.source).toBe("Website");
    expect(lead.estValue).toBe(0);
    expect(lead.tags).toEqual([]);
    expect(lead.order).toBe(0);
  });

  it("User defaults role=admin and status=active and lowercases email", async () => {
    const u = await models.User.create({ name: "X", email: "MixedCase@X.com" });
    expect(u.role).toBe("admin");
    expect(u.status).toBe("active");
    expect(u.email).toBe("mixedcase@x.com");
    expect(u.authProvider).toBe("password");
  });

  it("Account defaults status=active and value=0", async () => {
    const a = await models.Account.create({
      workspaceId: new Types.ObjectId(),
      ownerId: new Types.ObjectId(),
      name: "Acme",
    });
    expect(a.status).toBe("active");
    expect(a.value).toBe(0);
  });

  it("Invoice defaults status=draft", async () => {
    const i = await models.Invoice.create({
      workspaceId: new Types.ObjectId(),
      accountId: new Types.ObjectId(),
      number: 1,
      amount: 100,
    });
    expect(i.status).toBe("draft");
  });

  it("rejects an out-of-enum lead stage", async () => {
    await expect(
      models.Lead.create({ workspaceId: new Types.ObjectId(), ownerId: new Types.ObjectId(), name: "X", stage: "bogus" }),
    ).rejects.toThrow();
  });

  it("Activity requires kind and title", async () => {
    await expect(models.Activity.create({ workspaceId: new Types.ObjectId() })).rejects.toThrow();
  });
});
