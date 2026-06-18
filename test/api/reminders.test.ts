import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { Types } from "mongoose";
import { startTestDB, stopTestDB, clearDB } from "../helpers/db";
import { jsonRequest, ctx } from "../helpers/api";
import type { IUser } from "@/lib/models";

// Mutable holder so each test can set the "logged in" user.
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
let remindersRoute: typeof import("@/app/api/reminders/route");
let reminderIdRoute: typeof import("@/app/api/reminders/[id]/route");
let settingsRoute: typeof import("@/app/api/reminders/settings/route");
let dispatchRoute: typeof import("@/app/api/reminders/dispatch/route");
let lib: typeof import("@/lib/reminders");

let workspaceId: Types.ObjectId;
let admin: IUser;
let standard: IUser;

beforeAll(async () => {
  await startTestDB();
  const { connectDB } = await import("@/lib/db");
  models = await import("@/lib/models");
  remindersRoute = await import("@/app/api/reminders/route");
  reminderIdRoute = await import("@/app/api/reminders/[id]/route");
  settingsRoute = await import("@/app/api/reminders/settings/route");
  dispatchRoute = await import("@/app/api/reminders/dispatch/route");
  lib = await import("@/lib/reminders");
  await connectDB();
});
afterAll(stopTestDB);

beforeEach(async () => {
  await clearDB();
  workspaceId = new Types.ObjectId();
  const a = await models.User.create({ workspaceId, name: "Admin", email: "admin@x.com", role: "admin", status: "active" });
  const s = await models.User.create({ workspaceId, name: "Stan", email: "stan@x.com", role: "standard", status: "active" });
  admin = a.toObject() as IUser;
  standard = s.toObject() as IUser;
  session.user = admin;
  delete process.env.CRON_SECRET;
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function createReminder(body: Record<string, unknown>) {
  const res = await remindersRoute.POST(jsonRequest("http://localhost/api/reminders", "POST", body));
  return { status: res.status, json: await res.json() };
}

describe("reminders CRUD", () => {
  it("creates a standalone reminder owned by the caller", async () => {
    const { status, json } = await createReminder({ title: "Call back", dueAt: "2026-07-01T09:00:00.000Z", notes: "ring twice" });
    expect(status).toBe(201);
    expect(json.reminder.title).toBe("Call back");
    expect(json.reminder.status).toBe("scheduled");
    expect(json.reminder.leadId).toBeNull();
  });

  it("requires a title and a valid due date", async () => {
    expect((await createReminder({ dueAt: "2026-07-01T09:00:00.000Z" })).status).toBe(400);
    expect((await createReminder({ title: "x", dueAt: "not-a-date" })).status).toBe(400);
  });

  it("links to a visible lead and logs a timeline activity", async () => {
    const lead = await models.Lead.create({ workspaceId, ownerId: admin._id, name: "Acme", source: "Website", stage: "new" });
    const { json } = await createReminder({ title: "Send quote", dueAt: "2026-07-01T09:00:00.000Z", leadId: String(lead._id) });
    expect(json.reminder.leadId).toBe(String(lead._id));
    expect(json.reminder.entityLabel).toBe("Acme");

    const activity = await models.Activity.findOne({ leadId: lead._id, kind: "reminder" }).lean();
    expect(activity).toBeTruthy();
  });

  it("rejects linking to a lead the caller cannot see", async () => {
    const lead = await models.Lead.create({ workspaceId, ownerId: admin._id, name: "Hidden", source: "Website", stage: "new" });
    session.user = standard; // standard only sees its own
    expect((await createReminder({ title: "x", dueAt: "2026-07-01T09:00:00.000Z", leadId: String(lead._id) })).status).toBe(404);
  });

  it("scopes the list to the signed-in user only", async () => {
    await createReminder({ title: "Mine", dueAt: "2026-07-01T09:00:00.000Z" });
    session.user = standard;
    await createReminder({ title: "Theirs", dueAt: "2026-07-01T09:00:00.000Z" });

    const res = await remindersRoute.GET(jsonRequest("http://localhost/api/reminders", "GET"));
    const { reminders } = await res.json();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].title).toBe("Theirs");
  });

  it("completes, snoozes, and archives a reminder", async () => {
    const { json } = await createReminder({ title: "Tweak", dueAt: "2026-07-01T09:00:00.000Z" });
    const id = json.reminder.id;

    let res = await reminderIdRoute.PATCH(jsonRequest(`http://localhost/api/reminders/${id}`, "PATCH", { action: "complete" }), ctx({ id }));
    expect((await res.json()).reminder.status).toBe("done");

    const later = "2026-08-01T09:00:00.000Z";
    res = await reminderIdRoute.PATCH(jsonRequest(`http://localhost/api/reminders/${id}`, "PATCH", { action: "snooze", dueAt: later }), ctx({ id }));
    const snoozed = (await res.json()).reminder;
    expect(snoozed.status).toBe("scheduled");
    expect(snoozed.dueAt).toBe(new Date(later).toISOString());

    res = await reminderIdRoute.DELETE(jsonRequest(`http://localhost/api/reminders/${id}`, "DELETE"), ctx({ id }));
    expect(res.status).toBe(200);
    const gone = await models.Reminder.findById(id).lean();
    expect(gone?.deletedAt).toBeTruthy();
  });
});

describe("reminder settings", () => {
  it("requires a URL before enabling", async () => {
    const res = await settingsRoute.PUT(jsonRequest("http://localhost/api/reminders/settings", "PUT", { enabled: true, url: "" }));
    expect(res.status).toBe(400);
  });

  it("upserts the per-user webhook config", async () => {
    const res = await settingsRoute.PUT(
      jsonRequest("http://localhost/api/reminders/settings", "PUT", {
        enabled: true,
        url: "https://example.com/hook",
        method: "POST",
        headers: [{ key: "Authorization", value: "Bearer x" }, { key: "", value: "dropped" }],
        payloadTemplate: '{"text":"{{title}}"}',
      }),
    );
    const { setting } = await res.json();
    expect(setting.enabled).toBe(true);
    expect(setting.headers).toHaveLength(1); // blank-keyed header filtered out

    const stored = await models.ReminderSetting.findOne({ userId: admin._id }).lean();
    expect(stored?.url).toBe("https://example.com/hook");
  });
});

describe("template rendering", () => {
  it("substitutes and JSON-escapes variables", () => {
    const out = lib.renderTemplate('{"t":"{{title}}","n":"{{notes}}"}', { title: 'He said "hi"', notes: "line1\nline2" });
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out)).toEqual({ t: 'He said "hi"', n: "line1\nline2" });
  });

  it("leaves unknown placeholders untouched", () => {
    expect(lib.renderTemplate("{{nope}}", {})).toBe("{{nope}}");
  });
});

describe("dispatch", () => {
  function mockFetch(impl: () => Promise<Response>) {
    const fn = vi.fn(impl);
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("delivers due reminders to the owner's webhook and marks them sent", async () => {
    await models.ReminderSetting.create({
      workspaceId,
      userId: admin._id,
      enabled: true,
      url: "https://example.com/hook",
      method: "POST",
      headers: [{ key: "X-Test", value: "{{title}}" }],
      payloadTemplate: '{"text":"{{title}}"}',
    });
    const r = await models.Reminder.create({ workspaceId, userId: admin._id, title: "Due now", dueAt: new Date(Date.now() - 1000), status: "scheduled" });

    const fetchMock = mockFetch(async () => new Response("ok", { status: 200 }));
    const summary = await lib.dispatchDueReminders({});
    expect(summary).toMatchObject({ due: 1, sent: 1, failed: 0, skipped: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ text: "Due now" });
    expect((init as RequestInit).headers).toMatchObject({ "X-Test": "Due now" });

    const fresh = await models.Reminder.findById(r._id).lean();
    expect(fresh?.status).toBe("sent");
    expect(fresh?.sentAt).toBeTruthy();
  });

  it("skips reminders whose owner has no enabled webhook", async () => {
    await models.Reminder.create({ workspaceId, userId: admin._id, title: "Orphan", dueAt: new Date(Date.now() - 1000), status: "scheduled" });
    const fetchMock = mockFetch(async () => new Response("ok"));
    const summary = await lib.dispatchDueReminders({});
    expect(summary).toMatchObject({ due: 1, sent: 0, skipped: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries on failure and gives up after the attempt cap", async () => {
    await models.ReminderSetting.create({ workspaceId, userId: admin._id, enabled: true, url: "https://example.com/hook", method: "POST", payloadTemplate: "{}" });
    const r = await models.Reminder.create({ workspaceId, userId: admin._id, title: "Flaky", dueAt: new Date(Date.now() - 1000), status: "scheduled", attempts: 4 });

    mockFetch(async () => new Response("nope", { status: 500 }));
    const summary = await lib.dispatchDueReminders({});
    expect(summary).toMatchObject({ due: 1, failed: 1 });
    const fresh = await models.Reminder.findById(r._id).lean();
    expect(fresh?.status).toBe("failed");
    expect(fresh?.attempts).toBe(5);
  });

  it("only sweeps the signed-in user's reminders without a cron secret", async () => {
    await models.ReminderSetting.create({ workspaceId, userId: standard._id, enabled: true, url: "https://example.com/hook", method: "POST", payloadTemplate: "{}" });
    await models.Reminder.create({ workspaceId, userId: standard._id, title: "Stan due", dueAt: new Date(Date.now() - 1000), status: "scheduled" });
    await models.Reminder.create({ workspaceId, userId: admin._id, title: "Admin due", dueAt: new Date(Date.now() - 1000), status: "scheduled" });

    const fetchMock = mockFetch(async () => new Response("ok", { status: 200 }));
    session.user = standard;
    const res = await dispatchRoute.POST(jsonRequest("http://localhost/api/reminders/dispatch", "POST", {}));
    const json = await res.json();
    expect(json.scope).toBe("self");
    expect(json.sent).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("per-lead webhook override", () => {
  function mockFetch() {
    const fn = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  async function makeLead() {
    return models.Lead.create({ workspaceId, ownerId: admin._id, name: "Acme", source: "Website", stage: "new" });
  }

  it("upserts and reads a lead override alongside the default", async () => {
    const lead = await makeLead();
    await settingsRoute.PUT(jsonRequest("http://localhost/api/reminders/settings", "PUT", { enabled: true, url: "https://default.example/hook", method: "POST", payloadTemplate: "{}" }));
    await settingsRoute.PUT(jsonRequest("http://localhost/api/reminders/settings", "PUT", { leadId: String(lead._id), enabled: true, url: "https://lead.example/hook", method: "POST", payloadTemplate: "{}" }));

    const res = await settingsRoute.GET(jsonRequest(`http://localhost/api/reminders/settings?leadId=${lead._id}`, "GET"));
    const json = await res.json();
    expect(json.hasOverride).toBe(true);
    expect(json.setting.url).toBe("https://lead.example/hook");

    // Two distinct configs now exist for the same user.
    expect(await models.ReminderSetting.countDocuments({ userId: admin._id })).toBe(2);
  });

  it("dispatch prefers the lead override, else the default", async () => {
    const lead = await makeLead();
    await models.ReminderSetting.create({ workspaceId, userId: admin._id, leadId: null, enabled: true, url: "https://default.example/hook", method: "POST", payloadTemplate: "{}" });
    await models.ReminderSetting.create({ workspaceId, userId: admin._id, leadId: lead._id, enabled: true, url: "https://lead.example/hook", method: "POST", payloadTemplate: "{}" });

    await models.Reminder.create({ workspaceId, userId: admin._id, title: "On lead", dueAt: new Date(Date.now() - 1000), status: "scheduled", leadId: lead._id });
    await models.Reminder.create({ workspaceId, userId: admin._id, title: "Standalone", dueAt: new Date(Date.now() - 1000), status: "scheduled" });

    const fetchMock = mockFetch();
    await lib.dispatchDueReminders({});
    const urls = fetchMock.mock.calls.map((c) => c[0]).sort();
    expect(urls).toEqual(["https://default.example/hook", "https://lead.example/hook"]);
  });

  it("falls back to the default when the lead override is disabled", async () => {
    const lead = await makeLead();
    await models.ReminderSetting.create({ workspaceId, userId: admin._id, leadId: null, enabled: true, url: "https://default.example/hook", method: "POST", payloadTemplate: "{}" });
    await models.ReminderSetting.create({ workspaceId, userId: admin._id, leadId: lead._id, enabled: false, url: "https://lead.example/hook", method: "POST", payloadTemplate: "{}" });
    await models.Reminder.create({ workspaceId, userId: admin._id, title: "On lead", dueAt: new Date(Date.now() - 1000), status: "scheduled", leadId: lead._id });

    const fetchMock = mockFetch();
    await lib.dispatchDueReminders({});
    expect(fetchMock.mock.calls[0][0]).toBe("https://default.example/hook");
  });

  it("removes a lead override, reverting to the default", async () => {
    const lead = await makeLead();
    await models.ReminderSetting.create({ workspaceId, userId: admin._id, leadId: lead._id, enabled: true, url: "https://lead.example/hook", method: "POST", payloadTemplate: "{}" });

    const res = await settingsRoute.DELETE(jsonRequest(`http://localhost/api/reminders/settings?leadId=${lead._id}`, "DELETE"));
    expect(res.status).toBe(200);
    expect(await models.ReminderSetting.countDocuments({ userId: admin._id, leadId: lead._id })).toBe(0);
  });

  it("won't remove the default config via DELETE", async () => {
    const res = await settingsRoute.DELETE(jsonRequest("http://localhost/api/reminders/settings", "DELETE"));
    expect(res.status).toBe(400);
  });
});
