import "server-only";
import { cookies } from "next/headers";
import { connectDB } from "../db";
import { User, Workspace, type IUser } from "../models";
import type { SessionUser } from "../types";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./session";

/** Write the session cookie for a payload. */
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
}

async function readPayload(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Resolve the current authenticated User document (DB-backed). Returns null if
 * there is no valid session or the user no longer exists.
 */
export async function getCurrentUser(): Promise<IUser | null> {
  const payload = await readPayload();
  if (!payload) return null;
  await connectDB();
  const user = await User.findOne({ email: payload.email.toLowerCase() }).lean<IUser>();
  return user ?? null;
}

/** Shape the session user for client consumption (with workspace name). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  let workspaceName: string | null = null;
  if (user.workspaceId) {
    const ws = await Workspace.findById(user.workspaceId).lean<{ name: string }>();
    workspaceName = ws?.name ?? null;
  }
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    authProvider: user.authProvider,
    workspaceId: user.workspaceId ? String(user.workspaceId) : null,
    workspaceName,
  };
}

/** Throwing variant for use in API route handlers. */
export async function requireUser(): Promise<IUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/**
 * Find-or-create a user from a verified identity (Firebase or demo). New users
 * start with no workspace (they'll go through onboarding); previously-invited
 * users are activated on first sign-in, keeping their assigned role/workspace.
 */
export async function upsertUserFromIdentity(identity: {
  email: string;
  name?: string;
  provider: IUser["authProvider"];
  firebaseUid?: string;
}): Promise<IUser> {
  await connectDB();
  const email = identity.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (!existing) {
    const created = await User.create({
      name: identity.name?.trim() || email.split("@")[0],
      email,
      authProvider: identity.provider,
      firebaseUid: identity.firebaseUid,
      role: "admin",
      status: "active",
    });
    return created.toObject();
  }
  const patch: Partial<IUser> = { authProvider: identity.provider };
  if (identity.firebaseUid) patch.firebaseUid = identity.firebaseUid;
  if (existing.status === "invited") patch.status = "active";
  if (!existing.name && identity.name) patch.name = identity.name;
  await User.updateOne({ _id: existing._id }, patch);
  const updated = await User.findById(existing._id).lean<IUser>();
  return updated!;
}
