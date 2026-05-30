import { Types } from "mongoose";
import type { IUser } from "./models";

/**
 * Role model from the wireframes:
 *   • admin    — sees & edits everything in the workspace
 *   • standard — sees only the records they own (leads / accounts they added)
 *
 * These helpers return Mongoose filter fragments that enforce the scope. They
 * always pin to the user's workspace so data never leaks across workspaces.
 */

export function isAdmin(user: IUser): boolean {
  return user.role === "admin";
}

/** Base filter for leads visible to this user. */
export function leadScope(user: IUser): Record<string, unknown> {
  const base: Record<string, unknown> = { workspaceId: user.workspaceId };
  if (!isAdmin(user)) base.ownerId = user._id;
  return base;
}

/** Base filter for accounts visible to this user. */
export function accountScope(user: IUser): Record<string, unknown> {
  const base: Record<string, unknown> = { workspaceId: user.workspaceId };
  if (!isAdmin(user)) base.ownerId = user._id;
  return base;
}

/** Whether a standard user may act on a record they own. */
export function canEditOwned(user: IUser, ownerId: Types.ObjectId): boolean {
  if (isAdmin(user)) return true;
  return String(ownerId) === String(user._id);
}
