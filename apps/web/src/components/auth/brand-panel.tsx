"use client";

import { BrandMark } from "@/components/ui/brand";
import { Cachet } from "@/components/ui/cachet";
import { useI18n } from "@/lib/i18n-client";

function Bar({ w, strong }: { w: string; strong?: boolean }) {
  return <span className={`block h-1.5 rounded-full ${strong ? "bg-neutral-300" : "bg-neutral-200"}`} style={{ width: w }} />;
}

/** Quiet side panel: the product in one sentence and a miniature invoice with its cachet pressed on it. */
export function BrandPanel() {
  const { t, locale } = useI18n();
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden rounded-3xl bg-background-secondary-default p-10 lg:flex">
      <div className="flex items-center gap-2.5">
        <BrandMark size={32} />
        <span className="brand-word text-[24px] leading-none text-text-primary">{t("brand.name")}</span>
      </div>

      <div className="mx-auto w-full max-w-[340px]">
        <div
          dir="ltr"
          aria-hidden="true"
          className="relative aspect-[210/260] rounded-lg border border-border-button-default bg-white p-5 shadow-lg"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <span className="block h-2 w-20 rounded-full bg-neutral-950" />
              <Bar w="64px" />
              <Bar w="48px" />
            </div>
            <div className="text-right">
              <span className="paper-display block text-[15px] leading-4 tracking-tight text-neutral-950">FACTURE</span>
              <span className="ident mt-1 block text-[9px] text-neutral-500">FA-2026-00018</span>
            </div>
          </div>
          <div className="mt-5 rounded-md border border-neutral-200 p-2.5">
            <Bar w="90px" strong />
            <span className="mt-1.5 block"><Bar w="120px" /></span>
          </div>
          <div className="mt-5 space-y-2.5 border-t border-neutral-950 pt-2.5">
            {["70%", "55%", "62%"].map((w, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <Bar w={w} />
                <span className="num text-[9px] text-neutral-500">{["4 500,00", "1 200,00", "6 900,00"][i]}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-baseline justify-between border-t-2 border-neutral-950 pt-2">
            <span className="text-[8px] font-semibold tracking-wider text-neutral-950 uppercase">Net à payer</span>
            <span className="num text-[14px] font-medium text-neutral-950">12 600,00 <span className="text-[9px] text-neutral-500">DH</span></span>
          </div>
          <div className="absolute end-5 -bottom-8">
            <Cachet animate size={132} tone="encre" word={t("stamp.issued")} top="Atelier Zellige" bottom="Fès" sub="24/11/2026" rtl={locale === "ar"} />
          </div>
        </div>
      </div>

      <div>
        <p className="max-w-sm text-title-3-medium text-text-primary">{t("auth.tagline")}</p>
      </div>
    </aside>
  );
}
