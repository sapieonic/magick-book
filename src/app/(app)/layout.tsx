import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { SessionProvider } from "@/components/layout/SessionContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";

// Every page in this segment is authenticated and reads the per-request session,
// so render dynamically rather than attempting to statically prerender at build.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.workspaceId) redirect("/onboarding");

  return (
    <SessionProvider user={user}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
        <MobileNav />
      </div>
    </SessionProvider>
  );
}
