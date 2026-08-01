import { type NextRequest } from "next/server";
import { ok, fail, route } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { Workspace, Lead, type IWorkspace } from "@/lib/models";
import { requireUser } from "@/lib/auth/server";
import { isAdmin, leadScope } from "@/lib/rbac";
import { DEFAULT_LEAD_CATEGORIES, DEFAULT_LEAD_CATEGORY } from "@/lib/constants";

function normalizeCategories(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const slug = item.trim().toLowerCase().replace(/\s+/g, " ");
    if (!slug || slug.length > 40) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  // Always keep the default unclassified bucket first.
  if (!seen.has(DEFAULT_LEAD_CATEGORY)) out.unshift(DEFAULT_LEAD_CATEGORY);
  else {
    const rest = out.filter((c) => c !== DEFAULT_LEAD_CATEGORY);
    out.length = 0;
    out.push(DEFAULT_LEAD_CATEGORY, ...rest);
  }
  return out;
}

function categoriesOf(ws: IWorkspace | null | undefined): string[] {
  if (ws?.leadCategories?.length) return ws.leadCategories;
  return [...DEFAULT_LEAD_CATEGORIES];
}

async function usageCounts(user: Awaited<ReturnType<typeof requireUser>>, categories: string[]) {
  const counts = await Lead.aggregate<{ _id: string; count: number }>([
    { $match: { ...leadScope(user), category: { $in: categories } } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const map: Record<string, number> = {};
  for (const c of categories) map[c] = 0;
  for (const row of counts) if (row._id) map[row._id] = row.count;
  return map;
}

/** Categories still stamped on leads but no longer in the workspace taxonomy. */
async function orphanCategories(user: Awaited<ReturnType<typeof requireUser>>, categories: string[]) {
  const rows = await Lead.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        ...leadScope(user),
        category: { $nin: categories, $exists: true, $ne: "" },
      },
    },
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows.filter((r) => r._id).map((r) => ({ category: r._id, count: r.count }));
}

// GET /api/workspace/categories — taxonomy for dropdowns (any member).
export const GET = route(async () => {
  const user = await requireUser();
  if (!user.workspaceId) return fail("No workspace.", 400);
  await connectDB();
  const ws = await Workspace.findById(user.workspaceId).lean<IWorkspace>();
  if (!ws) return fail("Workspace not found.", 404);
  const categories = categoriesOf(ws);
  const [counts, orphans] = await Promise.all([usageCounts(user, categories), orphanCategories(user, categories)]);
  return ok({ categories, counts, orphans, isAdmin: isAdmin(user) });
});

// PUT /api/workspace/categories — replace the workspace taxonomy (admin only).
export const PUT = route(async (req: NextRequest) => {
  const user = await requireUser();
  if (!isAdmin(user)) return fail("Only admins can manage lead categories.", 403);
  if (!user.workspaceId) return fail("No workspace.", 400);

  const body = await req.json().catch(() => ({}));
  const categories = normalizeCategories(body.categories);
  if (!categories || categories.length === 0) return fail("At least one category is required.");
  if (categories.length > 40) return fail("Too many categories (max 40).");

  await connectDB();
  const ws = await Workspace.findByIdAndUpdate(
    user.workspaceId,
    { leadCategories: categories },
    { returnDocument: "after" },
  ).lean<IWorkspace>();
  if (!ws) return fail("Workspace not found.", 404);
  const next = categoriesOf(ws);
  const [counts, orphans] = await Promise.all([usageCounts(user, next), orphanCategories(user, next)]);
  return ok({ categories: next, counts, orphans });
});
