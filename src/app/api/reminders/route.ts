import { type NextRequest } from "next/server";
import { ok, route, serializeReminder, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Reminder, Lead, Account, type IReminder, type ILead, type IAccount } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { reminderScope, leadScope, accountScope } from "@/lib/rbac";
import { logActivity } from "@/lib/services";
import { REMINDER_STATUSES } from "@/lib/constants";
import { Types } from "mongoose";

// GET /api/reminders — the signed-in user's reminders (optionally ?status=…&archived=1).
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  await connectDB();
  const archived = req.nextUrl.searchParams.get("archived") === "1";
  const status = req.nextUrl.searchParams.get("status");

  const filter: Record<string, unknown> = reminderScope(user, { archived });
  if (status && REMINDER_STATUSES.includes(status as IReminder["status"])) filter.status = status;

  const reminders = await Reminder.find(filter).sort({ dueAt: 1 }).lean<IReminder[]>();
  return ok({ reminders: reminders.map(serializeReminder) });
});

// POST /api/reminders — create a reminder, optionally linked to a lead or account.
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  await connectDB();
  const b = await req.json().catch(() => ({}));

  const title = (b.title || "").trim();
  if (!title) throw new HttpError("A reminder title is required.");
  const dueAt = new Date(b.dueAt);
  if (isNaN(dueAt.getTime())) throw new HttpError("A valid due date/time is required.");

  // Resolve an optional linked record, enforcing the caller can see it, and
  // capture its name so the timeline + webhook payload read well.
  let leadId: Types.ObjectId | undefined;
  let accountId: Types.ObjectId | undefined;
  let entityLabel = "";
  if (b.leadId) {
    const lead = await Lead.findOne({ _id: b.leadId, ...leadScope(user) }).lean<ILead>();
    if (!lead) throw new HttpError("Lead not found", 404);
    leadId = lead._id;
    entityLabel = lead.name;
  } else if (b.accountId) {
    const account = await Account.findOne({ _id: b.accountId, ...accountScope(user) }).lean<IAccount>();
    if (!account) throw new HttpError("Account not found", 404);
    accountId = account._id;
    entityLabel = account.name;
  }

  const reminder = await Reminder.create({
    workspaceId: user.workspaceId,
    userId: user._id,
    title,
    notes: b.notes?.trim(),
    dueAt,
    status: "scheduled",
    leadId,
    accountId,
    entityLabel,
  });

  // Surface it on the linked record's timeline ("reminders in lead comments").
  if (leadId || accountId) {
    await logActivity({
      workspaceId: user.workspaceId,
      leadId,
      accountId,
      actorId: user._id,
      kind: "reminder",
      title: "Reminder set",
      detail: `${title} · due ${dueAt.toLocaleString()}`,
    });
    if (leadId) await Lead.updateOne({ _id: leadId }, { lastActivityAt: new Date() });
    if (accountId) await Account.updateOne({ _id: accountId }, { lastActivityAt: new Date() });
  }

  return ok({ reminder: serializeReminder(reminder.toObject()) }, 201);
});
