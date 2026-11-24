"use client";

import { useEffect, useState } from "react";
import type { Dashboard } from "@facture/core";
import { Money } from "@/components/app/money";
import { useI18n } from "@/lib/i18n-client";
import { Panel, PanelHeader } from "./panel";

const BUCKETS = [
  { key: "notDue", label: "aging.notDue", color: "var(--ramp-0)" },
  { key: "d1to30", label: "aging.d1to30", color: "var(--ramp-1)" },
  { key: "d31to60", label: "aging.d31to60", color: "var(--ramp-2)" },
  { key: "d61to90", label: "aging.d61to90", color: "var(--ramp-3)" },
  { key: "over90", label: "aging.over90", color: "var(--ramp-4)" },
] as const;

export function AgingCard({ aging }: { aging: Dashboard["aging"] }) {
  const { t, locale } = useI18n();
  const total = BUCKETS.reduce((s, b) => s + Number(aging[b.key]), 0);
  return (
    <Panel>
      <PanelHeader title={t("dash.agingTitle")} sub={t("dash.agingSub")} />
      {total === 0 ? (
        <p className="py-8 text-center text-body-regular text-text-secondary">{t("dash.agingEmpty")}</p>
      ) : (
        <>
          <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" dir="ltr" role="img" aria-label={t("dash.agingTitle")}>
            {BUCKETS.map((b, i) => {
              const v = Number(aging[b.key]);
              if (v <= 0) return null;
              return (
                <span
                  key={b.key}
                  className="grow-x first:rounded-s-full last:rounded-e-full"
                  style={{ flexGrow: Math.max(v, total * 0.02), flexBasis: 0, background: b.color, ["--i" as string]: i }}
                />
              );
            })}
          </div>
          <ul className="mt-4 grid gap-2.5">
            {BUCKETS.map((b) => {
              const v = Number(aging[b.key]);
              return (
                <li key={b.key} className="flex items-center gap-2.5 text-body-regular">
                  <span className="size-2.5 shrink-0 rounded-[4px]" style={{ background: b.color }} />
                  <span className="flex-1 text-text-secondary">{t(b.label)}</span>
                  <Money value={aging[b.key]} locale={locale} bare className="text-body-medium text-text-primary" />
                  <span className="num w-10 text-end text-caption-1-medium text-text-tertiary">{Math.round((v / total) * 100)} %</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

const LEGAL = 60;
const R = 40;
const C = 2 * Math.PI * R;

export function RingCard({ days }: { days: number | null }) {
  const { t } = useI18n();
  const over = days !== null && days > LEGAL;
  const frac = days === null ? 0 : Math.min(1, days / LEGAL);
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(frac));
    return () => cancelAnimationFrame(id);
  }, [frac]);

  return (
    <Panel className="flex items-center gap-5">
      <svg
        viewBox="0 0 100 100"
        width="104"
        height="104"
        className={over ? "shrink-0 -rotate-90 text-text-error-primary" : "shrink-0 -rotate-90 text-accent-500"}
        role="img"
        aria-label={days === null ? t("dash.dsoNone") : t("dash.dsoLabel", { n: Math.round(days) })}
      >
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="10" className="stroke-border-button-default" />
        {days !== null && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - drawn)}
            className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
          />
        )}
      </svg>
      <div className="min-w-0">
        <h3 className="text-body-medium text-text-secondary">{t("dash.dsoTitle")}</h3>
        {days === null ? (
          <p className="mt-1 text-body-regular text-text-secondary">{t("dash.dsoNone")}</p>
        ) : (
          <>
            <div className="num text-title-1-medium text-text-primary">
              {Math.round(days)} <span className="text-headline-medium text-text-secondary">{t("dash.daysUnit")}</span>
            </div>
            <p className="mt-1 text-body-regular text-text-secondary">{over ? t("dash.dsoOver", { n: LEGAL }) : t("dash.dsoOk", { n: LEGAL })}</p>
          </>
        )}
      </div>
    </Panel>
  );
}
