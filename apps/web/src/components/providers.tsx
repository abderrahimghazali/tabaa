"use client";

import { MotionConfig } from "motion/react";
import { z } from "zod";
import { DirectionProvider } from "@/components/foundations/direction/direction";
import { TemplateCopyProvider } from "@/components/foundations/template-copy/template-copy";
import { Toaster } from "@/components/base/toast/toast";
import { I18nProvider } from "@/lib/i18n-client";
import { boardCopy } from "@/lib/boardui-copy";
import type { Locale } from "@/lib/format";
import { usePhone } from "@/lib/use-phone";

// Zod probes for eval() on first use, which a CSP without unsafe-eval reports as a violation.
z.config({ jitless: true });

function cspNonce() {
  return typeof document === "undefined" ? undefined : document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
}

// "ar-MA" keeps Western digits in Intl and React Aria's number and date fields.
const BCP47: Record<Locale, string> = { fr: "fr-FR", ar: "ar-MA" };

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // Phones keep toasts at the top, clear of the sticky action and save bars.
  const phone = usePhone();
  return (
    <DirectionProvider locale={BCP47[locale]}>
      <I18nProvider locale={locale}>
        <TemplateCopyProvider translate={(text) => boardCopy(text, locale)}>
          <MotionConfig nonce={cspNonce()}>
            {children}
            <Toaster position={phone ? "top-center" : "bottom-end"} />
          </MotionConfig>
        </TemplateCopyProvider>
      </I18nProvider>
    </DirectionProvider>
  );
}
