import "server-only";
import { Types } from "mongoose";
import { connectDB } from "./db";
import { Reminder, ReminderSetting, User, type IReminder, type IReminderSetting, type IUser } from "./models";
import { REMINDER_MAX_ATTEMPTS } from "./constants";

/** Base URL used to build deep-links back into the app for the payload. */
function appBaseUrl(explicit?: string): string {
  return (explicit || process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

/** A reminder's link back into the CRM, or "" when standalone. */
function entityUrl(r: IReminder, baseUrl: string): string {
  if (r.leadId) return `${baseUrl}/leads/${r.leadId}`;
  if (r.accountId) return `${baseUrl}/accounts/${r.accountId}`;
  return "";
}

function entityType(r: IReminder): string {
  if (r.leadId) return "lead";
  if (r.accountId) return "account";
  return "reminder";
}

/** JSON-escape a value so it can be dropped inside a quoted JSON string. */
const jsonFrag = (v: unknown) => JSON.stringify(v == null ? "" : String(v)).slice(1, -1);

/** Substitute `{{var}}` placeholders in the template with escaped values. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => (key in vars ? jsonFrag(vars[key]) : `{{${key}}}`));
}

/** Build the variable bag a template can reference for a given reminder. */
export function reminderVars(r: IReminder, owner: Pick<IUser, "name" | "email"> | null, baseUrl: string): Record<string, string> {
  return {
    title: r.title,
    notes: r.notes ?? "",
    dueAt: r.dueAt ? new Date(r.dueAt).toISOString() : "",
    entityType: entityType(r),
    entityName: r.entityLabel ?? "",
    entityUrl: entityUrl(r, baseUrl),
    reminderId: String(r._id),
    userName: owner?.name ?? "",
    userEmail: owner?.email ?? "",
  };
}

export interface DeliveryResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Fire the configured webhook for one reminder. Never throws. */
export async function deliverReminder(
  reminder: IReminder,
  setting: IReminderSetting,
  owner: Pick<IUser, "name" | "email"> | null,
  baseUrl: string,
): Promise<DeliveryResult> {
  const url = setting.url?.trim();
  if (!url) return { ok: false, error: "No webhook URL configured" };

  const vars = reminderVars(reminder, owner, baseUrl);
  const method = setting.method || "POST";
  const headers: Record<string, string> = {};
  for (const h of setting.headers ?? []) {
    if (h.key?.trim()) headers[h.key.trim()] = renderTemplate(h.value ?? "", vars);
  }

  let body: string | undefined;
  if (method !== "GET" && setting.payloadTemplate?.trim()) {
    body = renderTemplate(setting.payloadTemplate, vars);
    if (!headers["Content-Type"] && !headers["content-type"]) headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status, error: `Webhook responded ${res.status}` };
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

export interface DispatchSummary {
  due: number;
  sent: number;
  failed: number;
  skipped: number; // owner has no enabled webhook
}

/**
 * Find reminders that are due and deliver each to its owner's webhook. Scope to
 * a single user when `userId` is set (the "run my due reminders now" button),
 * otherwise sweep the whole system (the cron path). Never throws.
 */
export async function dispatchDueReminders(opts: { userId?: Types.ObjectId | string; baseUrl?: string; limit?: number } = {}): Promise<DispatchSummary> {
  await connectDB();
  const now = new Date();
  const baseUrl = appBaseUrl(opts.baseUrl);
  const limit = Math.min(opts.limit ?? 50, 200);

  const filter: Record<string, unknown> = { status: "scheduled", dueAt: { $lte: now }, deletedAt: null };
  if (opts.userId) filter.userId = new Types.ObjectId(String(opts.userId));

  const due = await Reminder.find(filter).sort({ dueAt: 1 }).limit(limit);
  const summary: DispatchSummary = { due: due.length, sent: 0, failed: 0, skipped: 0 };
  if (!due.length) return summary;

  // Cache per-owner settings + identity so a batch for one user hits Mongo once.
  const settings = new Map<string, IReminderSetting | null>();
  const owners = new Map<string, Pick<IUser, "name" | "email"> | null>();

  for (const reminder of due) {
    const ownerId = String(reminder.userId);
    if (!settings.has(ownerId)) {
      settings.set(ownerId, await ReminderSetting.findOne({ userId: reminder.userId }).lean<IReminderSetting>());
      owners.set(ownerId, await User.findById(reminder.userId).select("name email").lean<Pick<IUser, "name" | "email">>());
    }
    const setting = settings.get(ownerId) ?? null;
    const owner = owners.get(ownerId) ?? null;

    if (!setting || !setting.enabled || !setting.url?.trim()) {
      summary.skipped++;
      continue;
    }

    const result = await deliverReminder(reminder, setting, owner, baseUrl);
    reminder.attempts = (reminder.attempts ?? 0) + 1;
    reminder.lastAttemptAt = new Date();
    if (result.ok) {
      reminder.status = "sent";
      reminder.sentAt = new Date();
      reminder.lastError = undefined;
      summary.sent++;
    } else {
      reminder.lastError = result.error ?? "Delivery failed";
      // Give up after MAX_ATTEMPTS; otherwise leave it scheduled to retry next run.
      if (reminder.attempts >= REMINDER_MAX_ATTEMPTS) reminder.status = "failed";
      summary.failed++;
    }
    await reminder.save();
  }

  return summary;
}
