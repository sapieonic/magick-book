"use client";
import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatMoney } from "@/components/ui/Money";
import { cn, initials } from "@/lib/utils";
import type { NavSummary } from "@/lib/types";
import { useSession } from "./SessionContext";
import { UserMenu } from "./UserMenu";
import { NAV, SETTINGS_NAV, isActivePath, type NavItem } from "./nav";

/** Live figure shown beside a nav label, keyed by href. */
function navBadges(summary: NavSummary | null): Record<string, { text: string; className?: string } | undefined> {
  if (!summary) return {};
  return {
    "/leads": summary.openLeads ? { text: String(summary.openLeads) } : undefined,
    "/accounts": summary.accounts ? { text: String(summary.accounts) } : undefined,
    "/money": summary.moneyDue ? { text: `${formatMoney(summary.moneyDue, true)} due`, className: "text-due" } : undefined,
  };
}

/** Hover / focus label for the icon rail; hidden once the sidebar shows labels. */
function RailTip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full z-10 ml-3 hidden whitespace-nowrap rounded-bar bg-ink-1 px-2 py-1 text-[12px] font-medium text-on-ink group-hover:block group-focus-visible:block xl:!hidden"
    >
      {children}
    </span>
  );
}

function NavLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: { text: string; className?: string } }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={badge ? `${item.label}, ${badge.text}` : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-control px-2 py-[7px] transition-colors max-xl:size-11 max-xl:justify-center max-xl:p-0",
        active ? "bg-accent-tint font-semibold text-accent" : "font-medium text-ink-2 hover:bg-sunk",
      )}
    >
      <item.icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
      <span className="flex-1 max-xl:sr-only">{item.label}</span>
      {badge && <span className={cn("tnum text-[12px] font-normal text-ink-3 max-xl:sr-only", badge.className)}>{badge.text}</span>}
      <RailTip>
        {item.label}
        {badge && ` · ${badge.text}`}
      </RailTip>
    </Link>
  );
}

/**
 * Primary navigation: a 232px glass sidebar with labels and live counts from
 * 1280px up, a 56px icon rail with tooltips on tablets. Hidden on phones, where
 * `MobileTabBar` takes over.
 */
export function Sidebar({ summary }: { summary: NavSummary | null }) {
  const pathname = usePathname();
  const user = useSession();
  const badges = navBadges(summary);
  const items = user.role === "admin" ? [...NAV, SETTINGS_NAV] : NAV;
  const workspace = user.workspaceName ?? "Workspace";

  return (
    <nav
      aria-label="Primary"
      className="glass sticky top-3 z-30 hidden h-[calc(100dvh-24px)] w-14 shrink-0 flex-col gap-0.5 rounded-shell px-[5px] py-4 md:flex xl:w-[232px] xl:px-3"
    >
      <Link
        href="/dashboard"
        aria-label="MagickBook home"
        className="self-start rounded-control px-2.5 pb-3.5 pt-1 text-[17px] font-semibold tracking-[-0.01em] text-ink-1 max-xl:self-center"
      >
        M<span className="max-xl:hidden">agickBook</span>
      </Link>

      <div className="mb-3.5 flex items-center gap-2.5 rounded-control border border-line-strong bg-control px-2 py-1.5 font-medium max-xl:hidden">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-bar bg-ink-1 text-[12px] font-semibold text-on-ink" aria-hidden>
          {initials(workspace).charAt(0)}
        </span>
        <span className="truncate">{workspace}</span>
      </div>

      {items.map((item) => (
        <NavLink key={item.href} item={item} active={isActivePath(pathname, item)} badge={badges[item.href]} />
      ))}

      {summary && summary.recentAccounts.length > 0 && (
        <div className="mt-[22px] max-xl:hidden">
          <h2 className="px-2 pb-1.5 text-[12px] font-medium text-ink-3">Recent accounts</h2>
          {summary.recentAccounts.map((a) => (
            <Link key={a.id} href={`/accounts/${a.id}`} className="block truncate rounded-control px-2 py-1.5 text-ink-2 transition-colors hover:bg-sunk">
              {a.name}
            </Link>
          ))}
        </div>
      )}

      <div className="flex-1" />
      <UserMenu variant="sidebar" className="border-t border-line-strong pt-2" />
    </nav>
  );
}
