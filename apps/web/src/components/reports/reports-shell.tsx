"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RiFileListLine, RiHandCoinLine, RiPercentLine } from "@remixicon/react";
import { PageHeader } from "@/components/app/layout";
import { Tab, TabList, Tabs } from "@/components/base/tabs/tabs";
import { useI18n } from "@/lib/i18n-client";

const TABS = [
  { id: "tva", key: "reports.tab.vat", icon: RiPercentLine },
  { id: "retenues", key: "reports.tab.withholdings", icon: RiHandCoinLine },
  { id: "delais", key: "reports.tab.terms", icon: RiFileListLine },
] as const;

/** The three statements share a header and tabs; each tab is its own URL and keeps the period when you switch. */
export function ReportsShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = TABS.find((x) => pathname.startsWith(`/declarations/${x.id}`))?.id ?? "tva";
  const month = params.get("period");
  const keep = (id: string) => {
    // A quarter only means something to the payment-terms statement; a month does not to the quarterly one.
    const sp = new URLSearchParams();
    if (month && (id !== "delais" || month.includes("Q"))) sp.set("period", month);
    const qs = sp.toString();
    return `/declarations/${id}${qs ? `?${qs}` : ""}`;
  };
  return (
    <div>
      <PageHeader title={t("nav.reports")} subtitle={t("reports.subtitle")} className="print:hidden" />
      <Tabs selectedKey={selected} onSelectionChange={(k) => router.push(keep(String(k)))} className="print:hidden">
        <TabList aria-label={t("reports.tabs")}>
          {TABS.map(({ id, key, icon }) => (
            <Tab key={id} id={id} icon={icon}>
              {t(key)}
            </Tab>
          ))}
        </TabList>
      </Tabs>
      <div className="mt-4">{children}</div>
    </div>
  );
}
