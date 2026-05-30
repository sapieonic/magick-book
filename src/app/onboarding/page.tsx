import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { OnboardingClient } from "./OnboardingClient";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.workspaceId) redirect("/dashboard");
  return <OnboardingClient firstName={user.name.split(" ")[0]} />;
}
