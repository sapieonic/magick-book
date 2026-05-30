import { ok } from "@/lib/api";
import { firebaseClientConfig, isFirebaseClientConfigured, isDemoLoginAllowed } from "@/lib/auth/config";

// Public: tells the login screen which sign-in methods to render.
export async function GET() {
  const firebase = isFirebaseClientConfigured();
  return ok({
    firebase,
    demo: isDemoLoginAllowed(),
    firebaseConfig: firebase ? firebaseClientConfig : null,
  });
}
