import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import type { IUser } from "@/lib/models";
import type { InvoiceStatus } from "@/lib/constants";

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
let navRoute: typeof import("@/app/api/nav/route");

let workspaceId: Types.ObjectId;
let admin: IUser;
let standard: IUser;

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  navRoute = await import("@/app/api/nav/route");
  await connectDB();
});
afterAll(stopTestDB);

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const get = async () => (navRoute.GET as () => Promise<Response>)();

beforeEach(async () => {
  await clearDB();
  workspaceId = new Types.ObjectId();
  admin = (await models.User.create({ workspaceId, name: "Admin", email: "admin@x.com", role: "admin", status: "active" })).toObject() as IUser;
  standard = (await models.User.create({ workspaceId, name: "Stan", email: "stan@x.com", role: "standard", status: "active" })).toObject() as IUser;
  session.user = admin;

  await models.Lead.create([
    { workspaceId, ownerId: admin._id, name: "L1", stage: "new" },
    { workspaceId, ownerId: admin._id, name: "L2", stage: "proposal" },
    { workspaceId, ownerId: standard._id, name: "L3", stage: "qualified" },
    { workspaceId, ownerId: admin._id, name: "Won", stage: "won" },
    { workspaceId, ownerId: admin._id, name: "Lost", stage: "lost" },
    { workspaceId, ownerId: admin._id, name: "Parked", stage: "parked" },
    { workspaceId, ownerId: admin._id, name: "Archived", stage: "new", deletedAt: new Date() },
    { workspaceId: new Types.ObjectId(), ownerId: admin._id, name: "Elsewhere", stage: "new" },
  ]);

  const [mine, theirs, archived] = await models.Account.create([
    { workspaceId, ownerId: admin._id, name: "Admin Co", lastActivityAt: daysAgo(5) },
    { workspaceId, ownerId: standard._id, name: "Stan Co", lastActivityAt: daysAgo(1) },
    { workspaceId, ownerId: admin._id, name: "Gone Co", deletedAt: new Date() },
  ]);
  const invoice = (accountId: Types.ObjectId, number: number, amount: number, status: InvoiceStatus, extra = {}) => ({
    workspaceId, accountId, number, amount, status, issuedAt: new Date(), ...extra,
  });
  await models.Invoice.create([
    invoice(mine._id, 1, 1000, "sent"),
    invoice(mine._id, 2, 500, "overdue"),
    invoice(mine._id, 3, 9000, "paid"),
    invoice(mine._id, 4, 7000, "draft"),
    invoice(mine._id, 5, 300, "sent", { deletedAt: new Date() }),
    invoice(theirs._id, 6, 200, "sent"),
    invoice(archived._id, 7, 4000, "overdue"),
  ]);
});

describe("GET /api/nav", () => {
  it("rejects anonymous callers", async () => {
    session.user = null;
    expect((await get()).status).toBe(401);
  });

  it("gives an admin workspace-wide counts", async () => {
    const data = await (await get()).json();
    expect(data.openLeads).toBe(3); // new + proposal + qualified; won/lost/parked/archived/other workspace excluded
    expect(data.accounts).toBe(2);
    expect(data.moneyDue).toBe(1700); // sent + overdue on live accounts, live invoices only
    expect(data.recentAccounts.map((a: { name: string }) => a.name)).toEqual(["Stan Co", "Admin Co"]);
    expect(data.recentAccounts[0].id).toEqual(expect.any(String));
  });

  it("scopes a standard user to the records they own", async () => {
    session.user = standard;
    const data = await (await get()).json();
    expect(data.openLeads).toBe(1);
    expect(data.accounts).toBe(1);
    expect(data.moneyDue).toBe(200);
    expect(data.recentAccounts.map((a: { name: string }) => a.name)).toEqual(["Stan Co"]);
  });

  it("returns zeros for an empty workspace", async () => {
    await clearDB();
    expect(await (await get()).json()).toEqual({ openLeads: 0, accounts: 0, moneyDue: 0, recentAccounts: [] });
  });
});
