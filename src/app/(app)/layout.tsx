import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { SessionProvider } from "@/components/layout/SessionContext";
import { AppShell } from "@/components/layout/AppShell";

// Every page in this segment is authenticated and reads the per-request session,
// so render dynamically rather than attempting to statically prerender at build.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.workspaceId) redirect("/onboarding");

  return (
    <SessionProvider user={user}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
