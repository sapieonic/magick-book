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

/**
 * Soft-delete filter fragment. By default queries see only LIVE records
 * (deletedAt null/absent); pass `{ archived: true }` for the trash view.
 */
function deletedFilter(opts?: ScopeOpts): Record<string, unknown> {
  return { deletedAt: opts?.archived ? { $ne: null } : null };
}

export interface ScopeOpts {
  /** When true, return ARCHIVED (soft-deleted) records instead of live ones. */
  archived?: boolean;
}

/** Base filter for leads visible to this user. */
export function leadScope(user: IUser, opts?: ScopeOpts): Record<string, unknown> {
  const base: Record<string, unknown> = { workspaceId: user.workspaceId, ...deletedFilter(opts) };
  if (!isAdmin(user)) base.ownerId = user._id;
  return base;
}

/** Base filter for accounts visible to this user. */
export function accountScope(user: IUser, opts?: ScopeOpts): Record<string, unknown> {
  const base: Record<string, unknown> = { workspaceId: user.workspaceId, ...deletedFilter(opts) };
  if (!isAdmin(user)) base.ownerId = user._id;
  return base;
}

/** Whether a standard user may act on a record they own. */
export function canEditOwned(user: IUser, ownerId: Types.ObjectId): boolean {
  if (isAdmin(user)) return true;
  return String(ownerId) === String(user._id);
}
