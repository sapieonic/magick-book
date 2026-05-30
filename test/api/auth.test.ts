import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import { jsonRequest } from "../helpers/api";

// Stub the cookie-writing/reading helpers (they call next/headers cookies()
// which is only available inside a real request). Keep upsertUserFromIdentity
// real so the demo route exercises the genuine user-creation flow.
const setSessionCookie = vi.fn(async () => {});
const clearSessionCookie = vi.fn(async () => {});
vi.mock("@/lib/auth/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/server")>();
  return {
    ...actual,
    setSessionCookie,
    clearSessionCookie,
    // Build the session-user shape from the DB (avoids reading cookies()).
    getSessionUser: vi.fn(async () => {
      const { User } = await import("@/lib/models");
      const u = await User.findOne({}).sort({ createdAt: -1 }).lean();
      return u ? { id: String(u._id), name: u.name, email: u.email, role: u.role, status: u.status, authProvider: u.authProvider, workspaceId: u.workspaceId ? String(u.workspaceId) : null, workspaceName: null } : null;
    }),
  };
});

// Auth backend detection is env-captured at module load (NEXT_PUBLIC_* are
// inlined), so we drive it through a controllable mock instead of env vars.
const cfg = { firebase: false, demo: true };
vi.mock("@/lib/auth/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/config")>();
  return {
    ...actual,
    isFirebaseClientConfigured: vi.fn(() => cfg.firebase),
    isDemoLoginAllowed: vi.fn(() => cfg.demo),
    firebaseClientConfig: { apiKey: "k", authDomain: "d", projectId: "p", appId: "a" },
  };
});

let models: typeof import("@/lib/models");
let configRoute: typeof import("@/app/api/auth/config/route");
let demoRoute: typeof import("@/app/api/auth/demo/route");
let logoutRoute: typeof import("@/app/api/auth/logout/route");

const ENV = process.env.DOMAIN_WHITELIST;

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  configRoute = await import("@/app/api/auth/config/route");
  demoRoute = await import("@/app/api/auth/demo/route");
  logoutRoute = await import("@/app/api/auth/logout/route");
  await connectDB();
});
afterAll(stopTestDB);

beforeEach(async () => {
  await clearDB();
  vi.clearAllMocks();
  cfg.firebase = false;
  cfg.demo = true;
  delete process.env.DOMAIN_WHITELIST;
});
afterEach(() => {
  if (ENV === undefined) delete process.env.DOMAIN_WHITELIST;
  else process.env.DOMAIN_WHITELIST = ENV;
});

describe("GET /api/auth/config", () => {
  it("reports demo allowed and firebase off when Firebase is not configured", async () => {
    const body = await (await configRoute.GET()).json();
    expect(body.firebase).toBe(false);
    expect(body.demo).toBe(true);
    expect(body.firebaseConfig).toBeNull();
    expect(body.allowedDomains).toBeNull();
  });

  it("reflects a configured Firebase client and the whitelist label", async () => {
    cfg.firebase = true;
    cfg.demo = false;
    process.env.DOMAIN_WHITELIST = "@magickvoice.com";
    const body = await (await configRoute.GET()).json();
    expect(body.firebase).toBe(true);
    expect(body.demo).toBe(false);
    expect(body.firebaseConfig).toMatchObject({ apiKey: "k" });
    expect(body.allowedDomains).toBe("@magickvoice.com");
  });
});

describe("POST /api/auth/demo", () => {
  it("signs in a new user, creating them via the real upsert flow", async () => {
    const res = await demoRoute.POST(jsonRequest("/api/auth/demo", "POST", { email: "newcomer@solo.com", name: "Newcomer" }));
    expect(res.status).toBe(200);
    const { user } = await res.json();
    expect(user.email).toBe("newcomer@solo.com");
    expect(user.role).toBe("admin"); // first of their domain
    expect(setSessionCookie).toHaveBeenCalledOnce();
    expect(await models.User.countDocuments({ email: "newcomer@solo.com" })).toBe(1);
  });

  it("requires an email", async () => {
    const res = await demoRoute.POST(jsonRequest("/api/auth/demo", "POST", {}));
    expect(res.status).toBe(400);
  });

  it("403 when the email's domain isn't whitelisted", async () => {
    process.env.DOMAIN_WHITELIST = "@magickvoice.com";
    const res = await demoRoute.POST(jsonRequest("/api/auth/demo", "POST", { email: "eve@evil.com" }));
    expect(res.status).toBe(403);
  });

  it("403 (disabled) when demo login is not allowed", async () => {
    cfg.demo = false;
    const res = await demoRoute.POST(jsonRequest("/api/auth/demo", "POST", { email: "a@x.com" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and returns ok", async () => {
    const res = await logoutRoute.POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(clearSessionCookie).toHaveBeenCalledOnce();
  });
});
