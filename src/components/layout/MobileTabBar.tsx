"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShell } from "./ShellContext";
import { NAV, isActivePath, type NavItem } from "./nav";

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-14 flex-col items-center justify-center gap-0.5 rounded-control text-[12px]",
        active ? "font-semibold text-accent" : "font-medium text-ink-2",
      )}
    >
      <item.icon className="size-[22px]" strokeWidth={1.5} aria-hidden />
      {item.label}
    </Link>
  );
}

/** Floating glass tab bar for phones (below 720px), with "New lead" in the middle. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { newLead } = useShell();
  const half = Math.ceil(NAV.length / 2);
  const tabs = (items: NavItem[]) => items.map((item) => <Tab key={item.href} item={item} active={isActivePath(pathname, item)} />);

  return (
    <nav
      aria-label="Primary"
      className="glass fixed inset-x-2 bottom-[calc(8px+env(safe-area-inset-bottom))] z-30 grid h-[68px] grid-cols-5 items-center rounded-[22px] px-1 md:hidden"
    >
      {tabs(NAV.slice(0, half))}
      <div className="flex justify-center">
        <button type="button" onClick={newLead} aria-label="New lead" className="flex h-11 w-[52px] items-center justify-center rounded-control bg-ink-1 text-on-ink">
          <Plus className="size-[22px]" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      {tabs(NAV.slice(half))}
    </nav>
  );
}
