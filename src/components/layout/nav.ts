import { Building2, CalendarDays, IndianRupee, Kanban, SlidersHorizontal, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Path prefix that marks the item active, when it differs from `href`. */
  match?: string;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: CalendarDays },
  { href: "/leads", label: "Leads", icon: Kanban },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/money", label: "Money", icon: IndianRupee },
];

/** Admin-only. */
export const SETTINGS_NAV: NavItem = { href: "/settings/team", label: "Settings", icon: SlidersHorizontal, match: "/settings" };

export function isActivePath(pathname: string, item: NavItem): boolean {
  const base = item.match ?? item.href;
  return pathname === base || pathname.startsWith(base + "/");
}
