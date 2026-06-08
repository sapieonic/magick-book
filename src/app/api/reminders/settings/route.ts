import { type NextRequest } from "next/server";
import { ok, route, serializeReminderSetting, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { ReminderSetting, Lead, type IReminderSetting, type IReminder, type ILead } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { leadScope } from "@/lib/rbac";
import { REMINDER_HTTP_METHODS, DEFAULT_REMINDER_TEMPLATE } from "@/lib/constants";
import { deliverReminder } from "@/lib/reminders";
import { Types } from "mongoose";
import type { IUser } from "@/lib/models";

/**
 * Resolve the optional `?leadId`/`body.leadId` into a per-lead override target,
 * enforcing the caller can see the lead. Returns null for the user's default.
 */
async function resolveLeadId(user: IUser, raw: unknown): Promise<Types.ObjectId | null> {
  if (!raw) return null;
  const lead = await Lead.findOne({ _id: String(raw), ...leadScope(user) }).lean<ILead>();
  if (!lead) throw new HttpError("Lead not found", 404);
  return lead._id;
}

// GET /api/reminders/settings[?leadId=…] — the default config, or a lead override.
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  await connectDB();
  const leadId = await resolveLeadId(user, req.nextUrl.searchParams.get("leadId"));
  const setting = await ReminderSetting.findOne({ userId: user._id, leadId }).lean<IReminderSetting>();
  return ok({ setting: serializeReminderSetting(setting), defaultTemplate: DEFAULT_REMINDER_TEMPLATE, hasOverride: !!setting && !!leadId });
});

/** Normalize + validate an incoming config body into a setting patch. */
function parseConfig(b: Record<string, unknown>) {
  const enabled = !!b.enabled;
  const url = typeof b.url === "string" ? b.url.trim() : "";
  const method = REMINDER_HTTP_METHODS.includes(b.method as IReminderSetting["method"])
    ? (b.method as IReminderSetting["method"])
    : "POST";
  const headers = Array.isArray(b.headers)
    ? (b.headers as { key?: unknown; value?: unknown }[])
        .map((h) => ({ key: String(h.key ?? "").trim(), value: String(h.value ?? "") }))
        .filter((h) => h.key)
        .slice(0, 20)
    : [];
  const payloadTemplate = typeof b.payloadTemplate === "string" ? b.payloadTemplate : "";

  if (enabled) {
    if (!url) throw new HttpError("A webhook URL is required to enable reminders.");
    if (!/^https?:\/\//i.test(url)) throw new HttpError("The webhook URL must start with http:// or https://");
  }
  return { enabled, url, method, headers, payloadTemplate };
}

// PUT /api/reminders/settings — upsert the default config, or a lead override.
export const PUT = route(async (req: NextRequest) => {
  const user = await requireUser();
  await connectDB();
  const b = await req.json().catch(() => ({}));
  const leadId = await resolveLeadId(user, b.leadId);
  const patch = parseConfig(b);

  const setting = await ReminderSetting.findOneAndUpdate(
    { userId: user._id, leadId },
    { $set: patch, $setOnInsert: { workspaceId: user.workspaceId, userId: user._id, leadId } },
    { returnDocument: "after", upsert: true },
  ).lean<IReminderSetting>();

  return ok({ setting: serializeReminderSetting(setting) });
});

// DELETE /api/reminders/settings?leadId=… — drop a lead override (revert to default).
export const DELETE = route(async (req: NextRequest) => {
  const user = await requireUser();
  await connectDB();
  const leadId = await resolveLeadId(user, req.nextUrl.searchParams.get("leadId"));
  if (!leadId) throw new HttpError("Only per-lead overrides can be removed.");
  await ReminderSetting.deleteOne({ userId: user._id, leadId });
  return ok({ removed: true });
});

// POST /api/reminders/settings — send a sample payload to test a config.
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  await connectDB();
  const b = await req.json().catch(() => ({}));
  if (b.action !== "test") throw new HttpError("Unknown action.");

  const cfg = parseConfig({ ...b, enabled: true }); // url is required to test
  const baseUrl = req.nextUrl.origin;
  const sample = {
    _id: new Types.ObjectId(),
    title: "Test reminder from MagickBook",
    notes: "This is a sample payload to verify your webhook.",
    dueAt: new Date(),
    entityLabel: "Acme Corp",
    leadId: undefined,
    accountId: undefined,
  } as unknown as IReminder;

  const result = await deliverReminder(sample, { ...cfg } as IReminderSetting, { name: user.name, email: user.email }, baseUrl);
  if (!result.ok) throw new HttpError(result.error ?? "Test delivery failed", 502);
  return ok({ ok: true, status: result.status ?? 200 });
});
