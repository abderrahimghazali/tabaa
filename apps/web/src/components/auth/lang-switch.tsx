"use client";

import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { setLocale } from "@/lib/actions";
import type { Locale } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";

export function LangSwitch() {
  const { locale } = useI18n();
  const pick = (next: Locale) => {
    if (next === locale) return;
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    void setLocale(next);
  };
  return (
    <SegmentedControl
      aria-label="Langue / اللغة"
      selectedKeys={[locale]}
      onSelectionChange={(keys) => {
        const k = [...keys][0];
        if (k === "fr" || k === "ar") pick(k);
      }}
    >
      <SegmentedControlItem id="fr" lang="fr">FR</SegmentedControlItem>
      <SegmentedControlItem id="ar" lang="ar">العربية</SegmentedControlItem>
    </SegmentedControl>
  );
}
