import { ok } from "@/lib/api";
import { firebaseClientConfig, isFirebaseClientConfigured, isDemoLoginAllowed } from "@/lib/auth/config";
import { whitelistLabel } from "@/lib/auth/whitelist";

// Public: tells the login screen which sign-in methods to render.
export async function GET() {
  const firebase = isFirebaseClientConfigured();
  return ok({
    firebase,
    demo: isDemoLoginAllowed(),
    firebaseConfig: firebase ? firebaseClientConfig : null,
    allowedDomains: whitelistLabel(),
  });
}
