import { type NextRequest } from "next/server";
import { ok, fail, route } from "@/lib/api";
import { isDemoLoginAllowed } from "@/lib/auth/config";
import { setSessionCookie, upsertUserFromIdentity, getSessionUser } from "@/lib/auth/server";
import { isEmailAllowed, notAllowedMessage } from "@/lib/auth/whitelist";

// Passwordless sign-in for local dev / demos. The given email signs you in,
// creating a fresh user (which flows through onboarding) if it's new.
export const POST = route(async (req: NextRequest) => {
  if (!isDemoLoginAllowed()) return fail("Demo sign-in is disabled.", 403);

  const body = await req.json().catch(() => ({}));
  const email = (body.email || "").toLowerCase().trim();
  const name = body.name?.trim();

  if (!email || !email.includes("@")) return fail("Enter a work email to continue.");
  if (!isEmailAllowed(email)) return fail(notAllowedMessage(), 403);

  const user = await upsertUserFromIdentity({ email, name, provider: "demo" });
  await setSessionCookie({ uid: `demo:${email}`, email, name: name ?? user.name });

  const sessionUser = await getSessionUser();
  return ok({ user: sessionUser });
});
