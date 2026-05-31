"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/team", label: "Team & roles" },
  { href: "/settings/audit", label: "Audit log" },
];

/** Sub-navigation shared across the Settings pages. */
export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="border-b border-line px-4 sm:px-6 lg:px-8">
      <div className="flex gap-1">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "relative px-3.5 py-3 text-[13.5px] font-semibold transition-colors",
                active ? "text-violet-700" : "text-muted hover:text-ink",
              )}
            >
              {t.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-violet-500" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
