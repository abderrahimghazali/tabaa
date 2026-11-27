"use client";

import { usePathname } from "next/navigation";
import { RiBankLine, RiBuilding2Line, RiEqualizer3Line, RiShieldKeyholeLine, RiTeamLine, RiUserLine } from "@remixicon/react";
import { PageHeader } from "@/components/app/layout";
import { Tab, TabList, TabPanel, Tabs } from "@/components/base/tabs/tabs";
import { useI18n } from "@/lib/i18n-client";
import { LeaveGuard, useLeaveGuard } from "./leave-guard";

const TABS = [
  { id: "entreprise", key: "settings.company", icon: RiBuilding2Line },
  { id: "facturation", key: "settings.invoicing", icon: RiBankLine },
  { id: "preferences", key: "settings.preferences", icon: RiEqualizer3Line },
  { id: "compte", key: "settings.account", icon: RiUserLine },
  { id: "equipe", key: "settings.team", icon: RiTeamLine },
  { id: "securite", key: "settings.security", icon: RiShieldKeyholeLine },
] as const;

function Inner({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const guard = useLeaveGuard();
  const pathname = usePathname();
  const selected = TABS.find((tab) => pathname.startsWith(`/parametres/${tab.id}`))?.id ?? "entreprise";

  return (
    <div>
      <PageHeader title={t("nav.settings")} subtitle={t("settings.subtitle")} />
      <Tabs selectedKey={selected} onSelectionChange={(key) => guard.go(`/parametres/${key}`)}>
        <TabList aria-label={t("settings.tabsLabel")}>
          {TABS.map(({ id, key, icon }) => (
            <Tab key={id} id={id} icon={icon}>
              {t(key)}
            </Tab>
          ))}
        </TabList>
        <TabPanel id={selected}>{children}</TabPanel>
      </Tabs>
    </div>
  );
}

export function SettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <LeaveGuard>
      <Inner>{children}</Inner>
    </LeaveGuard>
  );
}
