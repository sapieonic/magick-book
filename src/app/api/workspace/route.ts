import { type NextRequest } from "next/server";
import { ok, fail, route } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Workspace, User } from "@/lib/models";
import { requireUser, getSessionUser } from "@/lib/auth/server";

// Create the user's workspace (onboarding step). Idempotent-ish: if the user
// already belongs to a workspace, we just rename it.
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json().catch(() => ({}));
  const name = (body.name || "").trim();
  if (!name) return fail("A workspace name is required.");
  const businessTypes: string[] = Array.isArray(body.businessTypes) ? body.businessTypes.slice(0, 8) : [];

  await connectDB();
  const domain = user.email.toLowerCase().split("@")[1] ?? "";

  if (user.workspaceId) {
    await Workspace.updateOne({ _id: user.workspaceId }, { name, businessTypes });
  } else {
    // Race guard: if someone from this domain already created the workspace
    // while this user was onboarding, join theirs as Standard instead of
    // creating a duplicate.
    const existingWs = domain ? await Workspace.findOne({ domain }).select("_id").lean<{ _id: unknown }>() : null;
    if (existingWs) {
      await User.updateOne({ _id: user._id }, { workspaceId: existingWs._id, role: "standard", status: "active" });
    } else {
      const ws = await Workspace.create({ name, businessTypes, ownerId: user._id, domain });
      await User.updateOne({ _id: user._id }, { workspaceId: ws._id, role: "admin", status: "active" });
    }
  }

  const sessionUser = await getSessionUser();
  return ok({ user: sessionUser });
});
