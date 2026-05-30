import { type NextRequest } from "next/server";
import { ok, fail, route, serializeMember, HttpError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User, Workspace, type IUser } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { isAdmin } from "@/lib/rbac";
import { ROLES } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/members/:id — change a teammate's role (admin only).
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  if (!isAdmin(user)) return fail("Only admins can change roles.", 403);
  await connectDB();
  const { id } = await ctx.params;

  const member = await User.findOne({ _id: id, workspaceId: user.workspaceId });
  if (!member) throw new HttpError("Member not found", 404);

  const b = await req.json().catch(() => ({}));
  if (!ROLES.includes(b.role)) return fail("Invalid role");

  // Don't let the workspace owner be demoted (keep at least one admin).
  const ws = await Workspace.findById(user.workspaceId).lean<{ ownerId: unknown }>();
  if (ws && String(ws.ownerId) === String(member._id) && b.role !== "admin") {
    return fail("The workspace owner must stay an admin.", 409);
  }

  member.role = b.role;
  await member.save();
  const invitedByName = member.invitedById
    ? (await User.findById(member.invitedById).select("name").lean<{ name: string }>())?.name ?? null
    : null;
  return ok({
    member: serializeMember(member.toObject() as IUser, { invitedByName, isYou: String(member._id) === String(user._id) }),
  });
});

// DELETE /api/members/:id — remove a teammate (admin only).
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  if (!isAdmin(user)) return fail("Only admins can remove teammates.", 403);
  await connectDB();
  const { id } = await ctx.params;
  if (String(id) === String(user._id)) return fail("You can't remove yourself.", 409);

  const ws = await Workspace.findById(user.workspaceId).lean<{ ownerId: unknown }>();
  if (ws && String(ws.ownerId) === String(id)) return fail("You can't remove the workspace owner.", 409);

  const res = await User.deleteOne({ _id: id, workspaceId: user.workspaceId });
  if (!res.deletedCount) throw new HttpError("Member not found", 404);
  return ok({ ok: true });
});
