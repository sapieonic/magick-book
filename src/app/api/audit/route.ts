import { type NextRequest } from "next/server";
import { Types } from "mongoose";
import { ok, fail, route, serializeAuditLog } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { AuditLog, type IAuditLog } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { isAdmin } from "@/lib/rbac";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/constants";

// GET /api/audit — workspace-wide audit log. Admin only.
// Filters: ?entity=lead|account|…, ?action=create|update|delete|restore,
// ?actorId=<user id>. ?limit= (default 100, max 500). Unknown values are ignored.
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  if (!isAdmin(user)) return fail("Only admins can view the workspace audit log.", 403);
  await connectDB();

  const sp = req.nextUrl.searchParams;
  const entity = sp.get("entity");
  const action = sp.get("action");
  const actorId = sp.get("actorId");
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 100));

  const filter: Record<string, unknown> = { workspaceId: user.workspaceId };
  if (entity && (AUDIT_ENTITIES as readonly string[]).includes(entity)) filter.entity = entity;
  if (action && (AUDIT_ACTIONS as readonly string[]).includes(action)) filter.action = action;
  if (actorId && Types.ObjectId.isValid(actorId)) filter.actorId = new Types.ObjectId(actorId);

  const entries = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean<IAuditLog[]>();
  return ok({ entries: entries.map(serializeAuditLog) });
});
