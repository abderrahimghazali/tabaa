"use client";

import { RiBankCardLine, RiCoinsFill, RiFileWarningLine, RiHandCoinLine } from "@remixicon/react";
import type { Dashboard } from "@facture/core";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import { currencyLabel, fmtNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";

type Kpi = Pick<
  Dashboard,
  "outstanding" | "overdue" | "collectedThisMonth" | "collectedLastMonth" | "vatCollectedThisMonth" | "unpaidCount" | "overdueCount"
>;

export function Kpis({ d }: { d: Kpi }) {
  const { t, locale } = useI18n();
  const money = (v: string) => `${fmtNumber(v)} ${currencyLabel(locale)}`;

  const prev = Number(d.collectedLastMonth);
  const pct = prev > 0 ? Math.round(((Number(d.collectedThisMonth) - prev) / prev) * 100) : null;
  const delta: Pick<Stat, "delta" | "deltaColor"> =
    pct === null
      ? { delta: t("dash.deltaNone"), deltaColor: "neutral" }
      : { delta: `\u2066${pct >= 0 ? "+" : "−"}${Math.abs(pct)} %\u2069`, deltaColor: pct >= 0 ? "lime" : "rose" };

  const stats: Stat[] = [
    {
      icon: RiHandCoinLine,
      label: t("dash.outstanding"),
      value: money(d.outstanding),
      delta: String(d.unpaidCount),
      deltaColor: "neutral",
      tone: "blue",
      caption: t("dash.unpaidLabel"),
    },
    {
      icon: RiFileWarningLine,
      label: t("dash.overdue"),
      value: money(d.overdue),
      delta: String(d.overdueCount),
      deltaColor: d.overdueCount > 0 ? "rose" : "neutral",
      tone: "pink",
      caption: t("dash.overdueLabel"),
    },
    {
      icon: RiCoinsFill,
      label: t("dash.collected"),
      value: money(d.collectedThisMonth),
      ...delta,
      tone: "emerald",
      caption: t("dash.vsLastMonth"),
    },
    {
      icon: RiBankCardLine,
      label: t("dash.vat"),
      value: money(d.vatCollectedThisMonth),
      delta: "—",
      deltaColor: "neutral",
      tone: "purple",
      caption: t("dash.vatSub"),
      hint: t("dash.vatHint"),
    },
  ];
  return <StatCards variant="footer" stats={stats} columns={2} />;
}
