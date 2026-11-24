"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Dashboard } from "@facture/core";
import { Chip } from "@/components/base/badges/chip";
import { useCountUp } from "@/hooks/use-count-up";
import { fmtCompact, monthLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { Money } from "@/components/app/money";
import { Panel } from "./panel";

/**
 * Adapted from BoardUI's Orders Chart Card: two bars per month (facturé beside
 * encaissé), a count-up headline that follows the hovered month, a legend and a
 * delta chip. The chart keeps physical (left-to-right) coordinates in RTL.
 */

const subscribeMotion = (cb: () => void) => {
  const q = window.matchMedia("(prefers-reduced-motion: reduce)");
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};

export function InvoicedCollectedChart({ monthly }: { monthly: Dashboard["monthly"] }) {
  const { t, locale } = useI18n();
  const [active, setActive] = useState<number | null>(null);
  const reduce = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);

  const data = useMemo(
    () => monthly.map((m) => ({ key: m.month, label: monthLabel(m.month, locale), invoiced: Number(m.invoiced), collected: Number(m.collected) })),
    [monthly, locale],
  );
  const totalInvoiced = data.reduce((s, m) => s + m.invoiced, 0);
  const totalCollected = data.reduce((s, m) => s + m.collected, 0);
  const point = active !== null ? data[active] : null;
  const invoiced = point ? point.invoiced : totalInvoiced;
  const collected = point ? point.collected : totalCollected;
  const rate = invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0;
  const shownInvoiced = useCountUp(Math.round(invoiced));
  const shownCollected = useCountUp(Math.round(collected));
  const peak = Math.max(1, ...data.map((d) => Math.max(d.invoiced, d.collected)));
  const unit = 10 ** Math.floor(Math.log10(peak));
  const yMax = (Math.ceil(peak / unit / 2) * 2) * unit;
  const ticks = [0, 1, 2, 3, 4].map((i) => (yMax * i) / 4);
  const title = point ? monthLabel(point.key, locale, "long") : t("dash.chartTitle");

  return (
    <Panel className="flex h-full flex-col gap-5">
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-body-medium text-text-secondary first-letter:uppercase">{title}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Money value={shownInvoiced.toFixed(2)} locale={locale} className="text-title-1-medium text-text-primary" />
            <Chip variant="bold" color={rate >= 70 ? "lime" : rate >= 40 ? "yellow" : "rose"}>
              {t("dash.rate", { n: `\u2066${rate} %\u2069` })}
            </Chip>
          </div>
          <p className="text-body-2-medium text-text-tertiary">
            {t("dash.collectedShort")} <Money value={shownCollected.toFixed(2)} locale={locale} bare />
          </p>
        </div>
        <dl className="flex shrink-0 items-center gap-4 text-body-2-medium text-text-secondary">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-accent-500" aria-hidden />
            <dt>{t("dash.invoiced")}</dt>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-chart-1-active" aria-hidden />
            <dt>{t("dash.collectedShort")}</dt>
          </div>
        </dl>
      </div>

      <div dir="ltr" className="h-[260px] w-full min-w-0" role="img" aria-label={t("dash.chartTitle")}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 260 }}>
          <BarChart
            data={data}
            margin={{ top: 4, right: 6, bottom: 0, left: 0 }}
            barCategoryGap="26%"
            barGap={3}
            onMouseMove={(state) => {
              const index = Number(state?.activeTooltipIndex);
              if (state?.isTooltipActive && Number.isFinite(index)) setActive(index);
            }}
            onMouseLeave={() => setActive(null)}
          >
            <YAxis
              width={44}
              domain={[0, yMax]}
              ticks={ticks}
              tickFormatter={(v: number) => fmtCompact(v)}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }}
            />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} tick={{ fontSize: 13, fill: "var(--color-text-tertiary)" }} />
            <Tooltip content={() => null} cursor={{ fill: "var(--color-chart-track)", opacity: 0.5 }} />
            <Bar dataKey="invoiced" fill="var(--color-accent-500)" radius={[4, 4, 0, 0]} isAnimationActive={!reduce} animationDuration={450} />
            <Bar dataKey="collected" fill="var(--color-chart-1-active)" radius={[4, 4, 0, 0]} isAnimationActive={!reduce} animationDuration={450} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>{t("dash.chartTitle")}</caption>
        <thead>
          <tr>
            <th>{t("dash.month")}</th>
            <th>{t("dash.invoiced")}</th>
            <th>{t("dash.collectedShort")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.key}>
              <td>{m.key}</td>
              <td>{m.invoiced}</td>
              <td>{m.collected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
