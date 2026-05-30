import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import { jsonRequest, formRequest, ctx } from "../helpers/api";
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

// Controllable S3 mock so the configured + unconfigured paths can both be tested
// without any real AWS dependency.
const s3State = { configured: false };
vi.mock("@/lib/s3", () => ({
  isS3Configured: vi.fn(() => s3State.configured),
  putObject: vi.fn(async (key: string) => key),
  presignGetUrl: vi.fn(async () => "https://signed.example/url"),
  invoiceKey: (ws: string, inv: string) => `workspaces/${ws}/invoices/${inv}`,
}));

let models: typeof import("@/lib/models");
let invoiceRoute: typeof import("@/app/api/invoices/[id]/route");
let documentRoute: typeof import("@/app/api/invoices/[id]/document/route");

let workspaceId: Types.ObjectId;
let admin: IUser;

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  invoiceRoute = await import("@/app/api/invoices/[id]/route");
  documentRoute = await import("@/app/api/invoices/[id]/document/route");
  await connectDB();
});
afterAll(stopTestDB);

beforeEach(async () => {
  await clearDB();
  s3State.configured = false;
  vi.clearAllMocks();
  workspaceId = new Types.ObjectId();
  admin = (await models.User.create({ workspaceId, name: "Admin", email: "admin@x.com", role: "admin", status: "active" })).toObject() as IUser;
  session.user = admin;
});

async function makeInvoice(over: Record<string, unknown> = {}) {
  const acc = await models.Account.create({ workspaceId, ownerId: admin._id, name: "Acct", status: "active" });
  const inv = await models.Invoice.create({ workspaceId, accountId: acc._id, number: 1001, amount: 5000, status: "sent", ...over });
  return { acc, inv };
}

describe("PATCH /api/invoices/:id", () => {
  it("marks an invoice paid", async () => {
    const { inv } = await makeInvoice();
    const res = await invoiceRoute.PATCH(jsonRequest(`/api/invoices/${inv._id}`, "PATCH", { status: "paid" }), ctx({ id: String(inv._id) }));
    const { invoice } = await res.json();
    expect(invoice.status).toBe("paid");
    expect((await models.Invoice.findById(inv._id).lean())?.status).toBe("paid");
  });

  it("remind is a no-op that returns reminded:true without changing status", async () => {
    const { inv } = await makeInvoice({ status: "overdue" });
    const res = await invoiceRoute.PATCH(jsonRequest(`/api/invoices/${inv._id}`, "PATCH", { action: "remind" }), ctx({ id: String(inv._id) }));
    const body = await res.json();
    expect(body.reminded).toBe(true);
    expect(body.invoice.status).toBe("overdue");
  });

  it("returns 400 when there is nothing to update", async () => {
    const { inv } = await makeInvoice();
    const res = await invoiceRoute.PATCH(jsonRequest(`/api/invoices/${inv._id}`, "PATCH", {}), ctx({ id: String(inv._id) }));
    expect(res.status).toBe(400);
  });

  it("404 for an invoice in another workspace", async () => {
    const { inv } = await makeInvoice();
    session.user = { ...admin, workspaceId: new Types.ObjectId() } as IUser;
    const res = await invoiceRoute.PATCH(jsonRequest(`/api/invoices/${inv._id}`, "PATCH", { status: "paid" }), ctx({ id: String(inv._id) }));
    expect(res.status).toBe(404);
  });
});

describe("invoice document route — S3 not configured", () => {
  it("POST upload returns 501 when storage isn't configured", async () => {
    const { inv } = await makeInvoice();
    s3State.configured = false;
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "inv.pdf", { type: "application/pdf" }));
    const res = await documentRoute.POST(formRequest(`/api/invoices/${inv._id}/document`, form), ctx({ id: String(inv._id) }));
    expect(res.status).toBe(501);
  });

  it("GET returns 404 when no file has been uploaded", async () => {
    const { inv } = await makeInvoice();
    const res = await documentRoute.GET(jsonRequest(`/api/invoices/${inv._id}/document`, "GET"), ctx({ id: String(inv._id) }));
    expect(res.status).toBe(404);
    // serialized hasFile is false
    expect((await models.Invoice.findById(inv._id).lean())?.fileKey).toBeUndefined();
  });
});

describe("invoice document route — S3 configured", () => {
  it("POST records fileKey/fileName and serialized hasFile flips to true", async () => {
    const { inv } = await makeInvoice();
    s3State.configured = true;
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3, 4])], "lumen.pdf", { type: "application/pdf" }));
    const res = await documentRoute.POST(formRequest(`/api/invoices/${inv._id}/document`, form), ctx({ id: String(inv._id) }));
    expect(res.status).toBe(201);
    const { invoice } = await res.json();
    expect(invoice.hasFile).toBe(true);
    expect(invoice.fileName).toBe("lumen.pdf");

    const fresh = await models.Invoice.findById(inv._id).lean();
    expect(fresh?.fileKey).toBe(`workspaces/${workspaceId}/invoices/${inv._id}`);
  });

  it("rejects a disallowed content type", async () => {
    const { inv } = await makeInvoice();
    s3State.configured = true;
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1])], "x.txt", { type: "text/plain" }));
    const res = await documentRoute.POST(formRequest(`/api/invoices/${inv._id}/document`, form), ctx({ id: String(inv._id) }));
    expect(res.status).toBe(400);
  });

  it("GET redirects (302) to the presigned URL once a file exists", async () => {
    const { inv } = await makeInvoice({ fileKey: "k", fileName: "f.pdf" });
    s3State.configured = true;
    const res = await documentRoute.GET(jsonRequest(`/api/invoices/${inv._id}/document`, "GET"), ctx({ id: String(inv._id) }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed.example/url");
  });

  it("DELETE detaches the file and hasFile flips back to false", async () => {
    const { inv } = await makeInvoice({ fileKey: "k", fileName: "f.pdf" });
    s3State.configured = true;
    const res = await documentRoute.DELETE(jsonRequest(`/api/invoices/${inv._id}/document`, "DELETE"), ctx({ id: String(inv._id) }));
    const { invoice } = await res.json();
    expect(invoice.hasFile).toBe(false);
    expect((await models.Invoice.findById(inv._id).lean())?.fileKey).toBeUndefined();
  });
});
