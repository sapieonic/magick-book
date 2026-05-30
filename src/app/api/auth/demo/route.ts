import { type NextRequest } from "next/server";
import { ok, fail, route } from "@/lib/api";
import { isDemoLoginAllowed } from "@/lib/auth/config";
import { setSessionCookie, upsertUserFromIdentity, getSessionUser } from "@/lib/auth/server";

// Passwordless sign-in for local dev / demos. Defaults to the seeded owner
// (Riya) so the workspace is populated; any other email creates a fresh user
// that flows through onboarding.
export const POST = route(async (req: NextRequest) => {
  if (!isDemoLoginAllowed()) return fail("Demo sign-in is disabled.", 403);

  const body = await req.json().catch(() => ({}));
  const email = (body.email || "riya@acme.in").toLowerCase().trim();
  const name = body.name?.trim();

  const user = await upsertUserFromIdentity({ email, name, provider: "demo" });
  await setSessionCookie({ uid: `demo:${email}`, email, name: name ?? user.name });

  const sessionUser = await getSessionUser();
  return ok({ user: sessionUser });
});
