"use client";

import { useTransition } from "react";
import { Radio, RadioGroup } from "@/components/base/radio/radio";
import { toast } from "@/components/base/toast/toast";
import { setLocale } from "@/lib/actions";
import type { Locale } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { Section } from "./section";

export function PreferencesForm() {
  const { t, locale } = useI18n();
  const [pending, start] = useTransition();

  const pick = (next: Locale) => {
    if (next === locale) return;
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    start(async () => {
      await setLocale(next);
      toast.success(t("settings.saved"));
    });
  };

  return (
    <div className="grid max-w-3xl gap-4">
      <Section title={t("settings.prefs.languageTitle")} description={t("settings.prefs.languageHint")}>
        <div className="sm:col-span-2">
          <RadioGroup aria-label={t("settings.prefs.languageTitle")} value={locale} onChange={(v) => pick(v as Locale)} isDisabled={pending}>
            <Radio value="fr"><span lang="fr">{t("settings.prefs.fr")}</span></Radio>
            <Radio value="ar"><span lang="ar">{t("settings.prefs.ar")}</span></Radio>
          </RadioGroup>
        </div>
        <p className="text-body-regular text-text-secondary sm:col-span-2">{t("settings.prefs.digits")}</p>
      </Section>
    </div>
  );
}
