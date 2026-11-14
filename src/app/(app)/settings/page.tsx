import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";

/** `/settings` has no page of its own: open the first tab this user can use. */
export default async function SettingsIndexPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(user.role === "admin" ? "/settings/team" : "/settings/categories");
}
