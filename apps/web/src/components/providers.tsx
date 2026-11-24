"use client";

import { DirectionProvider } from "@/components/foundations/direction/direction";
import { TemplateCopyProvider } from "@/components/foundations/template-copy/template-copy";
import { Toaster } from "@/components/base/toast/toast";
import { I18nProvider } from "@/lib/i18n-client";
import { boardCopy } from "@/lib/boardui-copy";
import type { Locale } from "@/lib/format";

// "ar-MA" keeps Western digits in Intl and React Aria's number and date fields.
const BCP47: Record<Locale, string> = { fr: "fr-FR", ar: "ar-MA" };

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <DirectionProvider locale={BCP47[locale]}>
      <I18nProvider locale={locale}>
        <TemplateCopyProvider translate={(text) => boardCopy(text, locale)}>
          {children}
          <Toaster position="bottom-end" />
        </TemplateCopyProvider>
      </I18nProvider>
    </DirectionProvider>
  );
}
