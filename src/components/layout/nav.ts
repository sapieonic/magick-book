import { Building2, CalendarDays, IndianRupee, Kanban, SlidersHorizontal, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: CalendarDays },
  { href: "/leads", label: "Leads", icon: Kanban },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/money", label: "Money", icon: IndianRupee },
];

/** In the sidebar and palette for admins; the user menu offers it to everyone. `/settings` opens the first tab the user can use. */
export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: SlidersHorizontal };

export function isActivePath(pathname: string, item: NavItem): boolean {
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
