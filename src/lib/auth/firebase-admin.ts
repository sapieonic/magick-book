import "server-only";
import { cert, getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { isFirebaseAdminConfigured } from "./config";

let app: App | null = null;

function getAdminApp(): App | null {
  if (!isFirebaseAdminConfigured()) return null;
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0];
    return app;
  }
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Support keys pasted with literal "\n" escapes.
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    app = initializeApp({ credential: applicationDefault() });
  }
  return app;
}

/** Verify a Firebase ID token. Returns null if admin isn't configured. */
export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken | null> {
  const a = getAdminApp();
  if (!a) return null;
  return getAuth(a).verifyIdToken(idToken);
}
