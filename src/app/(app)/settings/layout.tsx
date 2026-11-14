import { Page } from "@/components/layout/Page";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Page>
      <SettingsTabs />
      {children}
    </Page>
  );
}
