import { type NextRequest } from "next/server";
import { ok, fail, route } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/server";
import { dispatchDueReminders } from "@/lib/reminders";

// This sweep should never be cached or statically evaluated.
export const dynamic = "force-dynamic";

/** Pull the presented cron secret from header (Vercel convention) or query. */
function presentedSecret(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-cron-key") || req.nextUrl.searchParams.get("key");
}

/**
 * Deliver due reminders.
 *  • Called by a scheduler with the cron secret  → sweeps ALL users.
 *  • Called by a signed-in user (e.g. "Run now")  → sweeps only their own.
 * Vercel Hobby crons only run daily; pair this with an external scheduler
 * (cron-job.org, GitHub Actions) hitting it every few minutes for fine-grained
 * delivery. See README/vercel.json.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const presented = presentedSecret(req);

  if (secret && presented === secret) {
    const summary = await dispatchDueReminders({ baseUrl: req.nextUrl.origin });
    return ok({ scope: "all", ...summary });
  }

  const user = await getCurrentUser();
  if (user) {
    const summary = await dispatchDueReminders({ userId: user._id, baseUrl: req.nextUrl.origin });
    return ok({ scope: "self", ...summary });
  }

  // No secret configured at all: allow full sweep in non-production so the
  // in-memory demo works without setup; lock it down once deployed.
  if (!secret && process.env.NODE_ENV !== "production") {
    const summary = await dispatchDueReminders({ baseUrl: req.nextUrl.origin });
    return ok({ scope: "all-dev", ...summary });
  }

  return fail("Unauthorized", 401);
}

export const GET = route(handle);
export const POST = route(handle);
