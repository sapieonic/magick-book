"use client";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/Misc";
import { Tabs, type TabItem } from "@/components/ui/Tabs";

type SettingsTab = "team" | "categories" | "reminders" | "audit";

const TABS: TabItem<SettingsTab>[] = [
  { key: "team", label: "Team & roles", href: "/settings/team" },
  { key: "categories", label: "Lead categories", href: "/settings/categories" },
  { key: "reminders", label: "Reminders", href: "/settings/reminders" },
  { key: "audit", label: "Audit log", href: "/settings/audit" },
];

/** Sub-navigation shared across the Settings pages: a glass strip of route tabs. */
export function SettingsTabs() {
  const pathname = usePathname();
  const active = TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.key ?? "team";
  return (
    <div className="glass rounded-panel px-4 pt-3.5 md:px-6">
      <Tabs aria-label="Settings" value={active} tabs={TABS} className="border-b-0" />
    </div>
  );
}

/** Top-bar title for a Settings page, under a "Settings" breadcrumb. */
export function SettingsHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return <PageHeader title={title} breadcrumb={[{ label: "Settings", href: "/settings" }]} actions={actions} />;
}

/** Shown in place of an admin-only section to standard users. */
export function AdminOnly({ description }: { description: string }) {
  return (
    <Panel>
      <EmptyState icon={<Lock className="size-6" strokeWidth={1.5} aria-hidden />} title="Admins only" description={description} />
    </Panel>
  );
}
