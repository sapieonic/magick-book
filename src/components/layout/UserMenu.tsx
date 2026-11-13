"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LifeBuoy, LogOut, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Popover } from "@/components/ui/Popover";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { useSession } from "./SessionContext";
import { SETTINGS_NAV } from "./nav";

const ITEM = "flex w-full items-center gap-2.5 rounded-control px-2 py-[7px] text-left max-md:min-h-11 text-ink-2 transition-colors hover:bg-hover hover:text-ink-1";

function MenuIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden />;
}

/**
 * The signed-in user's menu: theme, help, sign out (plus Settings where the
 * sidebar is not on screen). `sidebar` shows the name beside the avatar;
 * `topbar` is the avatar alone.
 */
export function UserMenu({ variant, className }: { variant: "sidebar" | "topbar"; className?: string }) {
  const user = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const roleLine = `${user.role === "admin" ? "Admin" : "Standard"} · ${user.workspaceName ?? "Workspace"}`;

  useEffect(() => setOpen(false), [pathname]);

  async function logout() {
    await api.post("/api/auth/logout");
    router.replace("/login");
    router.refresh();
  }

  const sidebar = variant === "sidebar";

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Account menu for ${user.name}`}
        className={cn(
          "flex items-center rounded-control",
          sidebar ? "w-full gap-2.5 p-1.5 text-left transition-colors hover:bg-hover max-xl:justify-center" : "size-11 justify-center",
        )}
      >
        <Avatar name={user.name} tone="ink" size={sidebar ? 28 : 30} />
        {sidebar && (
          <span className="min-w-0 max-xl:hidden">
            <span className="block truncate text-[13px] font-medium text-ink-1">{user.name}</span>
            <span className="block truncate text-[12px] text-ink-3">{roleLine}</span>
          </span>
        )}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} id={panelId} className="w-64 p-2">
        <div className="px-2 pb-2 pt-1">
          <p className="truncate font-medium text-ink-1">{user.name}</p>
          <p className="truncate text-[12px] text-ink-3">{user.email}</p>
          <p className="truncate text-[12px] text-ink-3">{roleLine}</p>
        </div>
        <ThemeToggle className="mb-1 flex" />
        {!sidebar && user.role === "admin" && (
          <Link href={SETTINGS_NAV.href} className={ITEM}>
            <MenuIcon icon={SETTINGS_NAV.icon} /> {SETTINGS_NAV.label}
          </Link>
        )}
        <a href="mailto:help@magickbook.app" className={ITEM}>
          <MenuIcon icon={LifeBuoy} /> Help &amp; support
        </a>
        <button type="button" onClick={logout} className={cn(ITEM, "hover:bg-overdue-tint hover:text-overdue")}>
          <MenuIcon icon={LogOut} /> Sign out
        </button>
      </Popover>
    </div>
  );
}
