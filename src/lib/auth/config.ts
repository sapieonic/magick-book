// Detects which auth backends are configured. Pure env inspection so it's safe
// to import from both client and server (only NEXT_PUBLIC_* vars are read on
// the client).

export const firebaseClientConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseClientConfigured(): boolean {
  return Boolean(firebaseClientConfig.apiKey && firebaseClientConfig.authDomain && firebaseClientConfig.projectId);
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(
    (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
}

/**
 * Demo (passwordless) sign-in is allowed when explicitly enabled, or by default
 * whenever Firebase isn't configured — so the app is always reachable locally.
 */
export function isDemoLoginAllowed(): boolean {
  const flag = process.env.ALLOW_DEMO_LOGIN;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return !isFirebaseClientConfigured();
}
