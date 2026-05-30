import { ok, fail } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail("Unauthorized", 401);
  return ok({ user });
}
