import { type NextRequest } from "next/server";
import { ok, fail, route } from "@/lib/api";
import { verifyFirebaseIdToken } from "@/lib/auth/firebase-admin";
import { isFirebaseAdminConfigured } from "@/lib/auth/config";
import { setSessionCookie, upsertUserFromIdentity, getSessionUser } from "@/lib/auth/server";

// Exchange a Firebase ID token for a MagickBook session cookie.
export const POST = route(async (req: NextRequest) => {
  const { idToken } = await req.json().catch(() => ({}));
  if (!idToken) return fail("Missing idToken");

  if (!isFirebaseAdminConfigured()) {
    return fail(
      "Firebase Admin is not configured on the server, so ID tokens can't be verified. " +
        "Add FIREBASE_* env vars, or use demo mode.",
      501,
    );
  }

  const decoded = await verifyFirebaseIdToken(idToken);
  if (!decoded?.email) return fail("Could not verify token", 401);

  const provider = decoded.firebase?.sign_in_provider?.includes("microsoft")
    ? "microsoft"
    : decoded.firebase?.sign_in_provider?.includes("google")
      ? "google"
      : "password";

  await upsertUserFromIdentity({
    email: decoded.email,
    name: decoded.name,
    provider,
    firebaseUid: decoded.uid,
  });

  await setSessionCookie({ uid: decoded.uid, email: decoded.email, name: decoded.name ?? "" });
  const user = await getSessionUser();
  return ok({ user });
});
