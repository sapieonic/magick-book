import { type NextRequest } from "next/server";
import { ok, route, serializeReminder, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Reminder, type IReminder } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { reminderScope } from "@/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/reminders/:id — edit, complete, cancel, snooze/reschedule, or restore.
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));

  // "restore" loads from the archived scope; everything else from the live one.
  const archived = b.action === "restore";
  const reminder = await Reminder.findOne({ _id: id, ...reminderScope(user, { archived }) });
  if (!reminder) throw new HttpError("Reminder not found", 404);

  switch (b.action) {
    case "complete":
      reminder.status = "done";
      break;
    case "cancel":
      reminder.status = "canceled";
      break;
    case "restore":
      reminder.deletedAt = null;
      reminder.deletedBy = undefined;
      break;
    case "snooze": {
      const dueAt = new Date(b.dueAt);
      if (isNaN(dueAt.getTime())) throw new HttpError("A valid due date/time is required.");
      reminder.dueAt = dueAt;
      reminder.status = "scheduled";
      reminder.attempts = 0;
      reminder.lastError = undefined;
      break;
    }
    default: {
      // Plain field edit.
      if (typeof b.title === "string") {
        if (!b.title.trim()) throw new HttpError("A reminder title is required.");
        reminder.title = b.title.trim();
      }
      if (typeof b.notes === "string") reminder.notes = b.notes.trim();
      if (b.dueAt !== undefined) {
        const dueAt = new Date(b.dueAt);
        if (isNaN(dueAt.getTime())) throw new HttpError("A valid due date/time is required.");
        reminder.dueAt = dueAt;
      }
    }
  }

  await reminder.save();
  return ok({ reminder: serializeReminder(reminder.toObject() as IReminder) });
});

// DELETE /api/reminders/:id — soft-delete (archive).
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  await connectDB();
  const { id } = await ctx.params;
  const reminder = await Reminder.findOne({ _id: id, ...reminderScope(user) });
  if (!reminder) throw new HttpError("Reminder not found", 404);

  reminder.deletedAt = new Date();
  reminder.deletedBy = user._id;
  await reminder.save();
  return ok({ id });
});
