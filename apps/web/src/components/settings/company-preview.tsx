"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { Company, Language } from "@facture/core";
import { Cachet } from "@/components/ui/cachet";
import { PaymentBlock, SellerBlock, SheetFooter, type Mark } from "@/components/invoice/invoice-sheet";
import { statusStamp } from "@/lib/status";
import { makeT } from "@/lib/i18n";

const PAPER = 480;

const Bar = ({ w, strong }: { w: string; strong?: boolean }) => (
  <span className={`block h-[7px] rounded-full ${strong ? "bg-neutral-200" : "bg-neutral-100"}`} style={{ width: w }} />
);

/** The invoice's seller block, payment block, footer and cachet, at the sheet's own type sizes, laid out at a real smaller width. */
export function CompanyPreview({ company, language, mark, label, skeletonLabel }: { company: Company; language: Language; mark: Mark; label: string; skeletonLabel: string }) {
  const L = language === "ar" ? "ar" : "fr";
  const t = makeT(L);
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.7);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setZoom(el.clientWidth / PAPER);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} role="group" aria-label={label} className="w-full">
      <div
        dir={L === "ar" ? "rtl" : "ltr"}
        lang={L}
        className="flex flex-col border border-neutral-200 bg-white px-7 pt-7 pb-5 text-[12px] leading-[18px] text-neutral-950 shadow-lg"
        style={{ width: PAPER, zoom, fontFamily: L === "ar" ? "var(--font-plex-ar), var(--font-inter)" : "var(--font-inter)" }}
      >
        <div className="flex justify-between gap-6">
          <SellerBlock c={company} mark={mark} />
          <div className="shrink-0 space-y-1.5 pt-1 text-end">
            <div className="paper-display text-[24px] leading-[28px] uppercase">{t("sheet.invoice")}</div>
            <div className="flex flex-col items-end gap-1.5 pt-1">
              <Bar w="92px" strong />
              <Bar w="70px" />
              <Bar w="70px" />
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3" role="img" aria-label={skeletonLabel}>
          <div className="rounded-[8px] border border-neutral-200 p-3">
            <div className="space-y-1.5">
              <Bar w="38%" strong />
              <Bar w="52%" />
            </div>
          </div>
          <div className="space-y-2.5 border-t border-neutral-950 pt-3">
            {["72%", "58%", "66%"].map((w) => (
              <div key={w} className="flex items-center justify-between gap-6 border-b border-neutral-100 pb-2.5">
                <Bar w={w} />
                <Bar w="14%" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-[1fr_auto] items-end gap-6">
          <div className="text-[11px] leading-[16px]">
            <PaymentBlock c={company} t={t} mark={mark} first={<Bar w="150px" />} />
          </div>
          <Cachet
            size={112}
            tone={statusStamp.issued}
            word={t("stamp.issued")}
            top={company.name || "Tabaa"}
            bottom={company.address.city || "Maroc"}
            rtl={L === "ar"}
          />
        </div>

        <SheetFooter
          c={company}
          currency="MAD"
          t={t}
          mark={mark}
          className="mt-6 border-t border-neutral-200 pt-3 text-center text-[10px] leading-[15px] text-neutral-500"
        />
      </div>
    </div>
  );
}
