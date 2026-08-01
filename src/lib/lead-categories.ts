import { Workspace, type IWorkspace } from "./models";
import { DEFAULT_LEAD_CATEGORIES, DEFAULT_LEAD_CATEGORY } from "./constants";

/** Resolve the workspace taxonomy, falling back to defaults for legacy workspaces. */
export async function workspaceLeadCategories(workspaceId: unknown): Promise<string[]> {
  const ws = await Workspace.findById(workspaceId).select("leadCategories").lean<IWorkspace>();
  if (ws?.leadCategories?.length) return ws.leadCategories;
  return [...DEFAULT_LEAD_CATEGORIES];
}

/**
 * Normalize a category write against the workspace taxonomy.
 * - `mode: "create"` — unknown/empty → unclassified
 * - `mode: "update"` — unknown → null (caller should leave the field untouched);
 *   still accepts the lead's current value even if it was removed from the taxonomy
 */
export async function resolveLeadCategory(
  workspaceId: unknown,
  raw: unknown,
  opts: { mode: "create" | "update"; current?: string } = { mode: "create" },
): Promise<string | null> {
  const allowed = await workspaceLeadCategories(workspaceId);
  const slug = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!slug) return opts.mode === "create" ? DEFAULT_LEAD_CATEGORY : null;
  if (allowed.includes(slug)) return slug;
  if (opts.mode === "update" && opts.current && slug === opts.current.toLowerCase()) return slug;
  return opts.mode === "create" ? DEFAULT_LEAD_CATEGORY : null;
}
