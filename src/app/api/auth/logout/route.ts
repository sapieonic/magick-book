import { ok, route } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth/server";

export const POST = route(async () => {
  await clearSessionCookie();
  return ok({ ok: true });
});
