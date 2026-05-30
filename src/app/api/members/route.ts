import { type NextRequest } from "next/server";
import { ok, fail, route, serializeMember } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User, type IUser } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { isAdmin } from "@/lib/rbac";
import { ROLES } from "@/lib/constants";

// GET /api/members — team list (Settings → Team & roles).
export const GET = route(async () => {
  const user = await requireUser();
  await connectDB();
  const members = await User.find({ workspaceId: user.workspaceId }).sort({ createdAt: 1 }).lean<IUser[]>();
  const names = new Map(members.map((m) => [String(m._id), m.name]));
  return ok({
    members: members.map((m) =>
      serializeMember(m, {
        invitedByName: m.invitedById ? names.get(String(m.invitedById)) ?? null : null,
        isYou: String(m._id) === String(user._id),
      }),
    ),
    isAdmin: isAdmin(user),
  });
});

// POST /api/members — invite a teammate (admin only).
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  if (!isAdmin(user)) return fail("Only admins can invite teammates.", 403);
  await connectDB();

  const b = await req.json().catch(() => ({}));
  const email = (b.email || "").toLowerCase().trim();
  if (!email || !email.includes("@")) return fail("A valid work email is required");
  const role = ROLES.includes(b.role) ? b.role : "standard";

  const existing = await User.findOne({ email }).lean<IUser>();
  if (existing) {
    if (String(existing.workspaceId) === String(user.workspaceId)) return fail("That person is already on your team.", 409);
    return fail("That email is already in use.", 409);
  }

  const invited = await User.create({
    workspaceId: user.workspaceId,
    name: b.name?.trim() || email.split("@")[0],
    email,
    role,
    status: "invited",
    authProvider: "demo",
    invitedById: user._id,
  });

  return ok(
    { member: serializeMember(invited.toObject(), { invitedByName: user.name, isYou: false }) },
    201,
  );
});
