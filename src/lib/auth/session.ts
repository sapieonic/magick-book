import { SignJWT, jwtVerify } from "jose";

// Edge-safe session token helpers (no next/headers, no DB) so this module can
// be imported by middleware running on the edge runtime.

export const SESSION_COOKIE = "mb_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  uid: string; // firebase uid or "demo:<email>"
  email: string;
  name: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || "dev-only-insecure-fallback-secret-please-set-SESSION_SECRET";
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.uid || !payload.email) return null;
    return { uid: String(payload.uid), email: String(payload.email), name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === "production",
};
