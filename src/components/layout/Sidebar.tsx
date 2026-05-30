"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Users, Building2, Wallet, Settings, LifeBuoy, LogOut, ChevronDown } from "lucide-react";
import { Logo } from "@/components/ui/Misc";
import { Avatar } from "@/components/ui/Avatar";
import { useSession } from "./SessionContext";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/accounts", label: "Accts", icon: Building2 },
  { href: "/money", label: "Money", icon: Wallet },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  async function logout() {
    await api.post("/api/auth/logout");
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 z-30 flex h-screen w-[84px] shrink-0 flex-col items-center border-r border-line bg-paper/80 py-4 backdrop-blur-sm">
      <Link href="/dashboard" className="brand-gradient flex size-11 items-center justify-center rounded-[var(--radius-md)] shadow-[var(--shadow-violet)]">
        <span className="font-display text-[22px] font-extrabold text-white">M</span>
      </Link>

      <nav className="mt-6 flex flex-1 flex-col gap-1.5">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex w-[64px] flex-col items-center gap-1 rounded-[var(--radius-md)] py-2.5 transition-all",
                active ? "bg-violet-50 text-violet-700" : "text-muted hover:bg-canvas hover:text-ink",
              )}
            >
              <item.icon className={cn("size-[21px] transition-transform group-hover:scale-110", active && "text-violet-600")} strokeWidth={active ? 2.3 : 2} />
              <span className="text-[10.5px] font-semibold tracking-tight">{item.label}</span>
            </Link>
          );
        })}

        {user.role === "admin" && (
          <Link
            href="/settings/team"
            className={cn(
              "group mt-1 flex w-[64px] flex-col items-center gap-1 rounded-[var(--radius-md)] py-2.5 transition-all",
              isActive("/settings") ? "bg-violet-50 text-violet-700" : "text-muted hover:bg-canvas hover:text-ink",
            )}
          >
            <Settings className="size-[21px] transition-transform group-hover:scale-110" strokeWidth={2} />
            <span className="text-[10.5px] font-semibold">Setup</span>
          </Link>
        )}
      </nav>

      <a
        href="mailto:help@magickbook.app"
        className="mb-2 flex w-[64px] flex-col items-center gap-1 rounded-[var(--radius-md)] py-2.5 text-muted transition-all hover:bg-canvas hover:text-ink"
      >
        <LifeBuoy className="size-[21px]" strokeWidth={2} />
        <span className="text-[10.5px] font-semibold">Help</span>
      </a>

      {/* User chip + menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] p-1.5 transition-colors hover:bg-canvas"
        >
          <Avatar name={user.name} size={34} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="animate-scale-in absolute bottom-1 left-[72px] z-20 w-60 overflow-hidden rounded-[var(--radius-md)] border border-line bg-paper p-1.5 shadow-[var(--shadow-pop)]">
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <Avatar name={user.name} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{user.name}</p>
                  <p className="truncate text-[11.5px] text-muted">{user.email}</p>
                </div>
              </div>
              <div className="mx-2 my-1 flex items-center justify-between rounded-md bg-canvas px-2 py-1.5">
                <span className="truncate text-[11.5px] text-ink-soft">{user.workspaceName ?? "Workspace"}</span>
                <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">{user.role}</span>
              </div>
              <button
                onClick={logout}
                className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-danger-bg hover:text-danger"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

/** Shared page header used across the app screens. */
export function PageHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md", className)}>
      <div className="flex h-[68px] items-center gap-4 px-6 lg:px-8">{children}</div>
    </header>
  );
}

export { ChevronDown };
