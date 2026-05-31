import { type NextRequest } from "next/server";
import { ok, fail, route, serializeAuditLog } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { AuditLog, type IAuditLog } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { isAdmin } from "@/lib/rbac";
import { AUDIT_ENTITIES } from "@/lib/constants";

// GET /api/audit — workspace-wide audit log. Admin only.
// Supports ?entity=lead|account|... and ?limit= (default 100, max 500).
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  if (!isAdmin(user)) return fail("Only admins can view the workspace audit log.", 403);
  await connectDB();

  const sp = req.nextUrl.searchParams;
  const entity = sp.get("entity");
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 100));

  const filter: Record<string, unknown> = { workspaceId: user.workspaceId };
  if (entity && (AUDIT_ENTITIES as readonly string[]).includes(entity)) filter.entity = entity;

  const entries = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean<IAuditLog[]>();
  return ok({ entries: entries.map(serializeAuditLog) });
});
