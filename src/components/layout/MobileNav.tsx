"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Settings, LifeBuoy, LogOut, MoreHorizontal, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useSession } from "./SessionContext";
import { NAV } from "./Sidebar";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

/**
 * Bottom tab bar for phones. The 84px desktop rail is hidden below `md`; this
 * takes its place with the primary nav plus a "More" sheet that holds the user
 * profile, workspace, theme switch, settings and sign-out.
 */
export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSession();
  const [sheet, setSheet] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // Close the sheet on navigation.
  useEffect(() => setSheet(false), [pathname]);

  async function logout() {
    await api.post("/api/auth/logout");
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-paper/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-semibold transition-colors",
                active ? "text-violet-600" : "text-muted",
              )}
            >
              <item.icon className="size-[22px]" strokeWidth={active ? 2.3 : 2} />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setSheet(true)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-semibold transition-colors",
            sheet ? "text-violet-600" : "text-muted",
          )}
        >
          <MoreHorizontal className="size-[22px]" strokeWidth={2} />
          More
        </button>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setSheet(false)} />
          <div className="animate-fade-up absolute inset-x-0 bottom-0 rounded-t-[var(--radius-xl)] border-t border-line bg-paper p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />

            <div className="flex items-center gap-3 px-1 py-1">
              <Avatar name={user.name} size={42} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{user.name}</p>
                <p className="truncate text-[12px] text-muted">{user.email}</p>
              </div>
              <button onClick={() => setSheet(false)} className="rounded-lg p-1.5 text-faint hover:bg-canvas hover:text-ink" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between rounded-[var(--radius-md)] bg-canvas px-3 py-2">
              <span className="truncate text-[12.5px] text-ink-soft">{user.workspaceName ?? "Workspace"}</span>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">{user.role}</span>
            </div>

            <div className="mt-3">
              <p className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Theme</p>
              <ThemeToggle />
            </div>

            <div className="mt-3 space-y-0.5">
              {user.role === "admin" && (
                <Link
                  href="/settings/team"
                  className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[14px] font-medium text-ink-soft transition-colors hover:bg-canvas"
                >
                  <Settings className="size-[18px] text-muted" /> Team &amp; setup
                </Link>
              )}
              <a
                href="mailto:help@magickbook.app"
                className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[14px] font-medium text-ink-soft transition-colors hover:bg-canvas"
              >
                <LifeBuoy className="size-[18px] text-muted" /> Help &amp; support
              </a>
              <button
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[14px] font-medium text-ink-soft transition-colors hover:bg-danger-bg hover:text-danger"
              >
                <LogOut className="size-[18px]" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
