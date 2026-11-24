"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addDays, type InvoiceSummary } from "@facture/core";
import { daysLabel, fmtDate, sub } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { Money } from "@/components/app/money";
import { cx } from "@/utils/cx";

const SPAN_BEFORE = 30;
const SPAN_AFTER = 60;
const GUTTER = 84;
const SOON = 14;
const TOOLTIP_ROOM = 100;
const AXIS = 60;

type Mark = {
  inv: InvoiceSummary;
  days: number;
  remaining: string;
  r: number;
  x: number;
  cy: number;
  tone: "danger" | "warn" | "accent";
  bucket: boolean;
};

const toneBg = { danger: "bg-foreground-icon-error", warn: "bg-chart-8-active", accent: "bg-accent-500" } as const;
const toneText = { danger: "text-text-error-primary", warn: "text-status-yellow-text", accent: "text-accent-600" } as const;

function layout(items: InvoiceSummary[], today: string, width: number): { marks: Mark[]; stack: number } {
  const x0 = GUTTER + 20;
  const x1 = width - 28;
  const unit = (x1 - x0) / (SPAN_BEFORE + SPAN_AFTER);
  const raw = items.map((inv) => {
    const remaining = sub(inv.amountDue, inv.paidAmount);
    const days = Math.round((Date.parse(inv.dueDate) - Date.parse(today)) / 86_400_000);
    return { inv, days, remaining };
  });
  const max = Math.max(1, ...raw.map((m) => Number(m.remaining)));
  const placed: Mark[] = [];
  const sorted = [...raw].sort((a, b) => a.days - b.days);
  for (const m of sorted) {
    const bucket = m.days < -SPAN_BEFORE;
    const share = Math.sqrt(Number(m.remaining) / max);
    // Bucket marks share one column, so they stay small to keep the card short.
    const r = bucket ? 7 + 7 * share : 9 + 21 * share;
    const x = bucket ? GUTTER / 2 + 4 : x0 + (Math.min(m.days, SPAN_AFTER) + SPAN_BEFORE) * unit;
    const gap = 2;
    const near = placed.filter((p) => Math.abs(p.x - x) < p.r + r + gap);
    const candidates = [
      r,
      ...near.map((p) => p.cy + Math.sqrt(Math.max(0, (p.r + r + gap) ** 2 - (p.x - x) ** 2))),
    ].sort((u, v) => u - v);
    const cy =
      candidates.find((c) => near.every((q) => Math.hypot(q.x - x, q.cy - c) >= q.r + r + gap - 0.5)) ??
      candidates[candidates.length - 1]!;
    const tone = m.days < 0 ? "danger" : m.days <= SOON ? "warn" : "accent";
    placed.push({ ...m, r, x, cy, tone, bucket });
  }
  const stack = Math.max(0, ...placed.map((p) => p.cy + p.r));
  return { marks: placed, stack };
}

export function Echeancier({ receivables, today }: { receivables: InvoiceSummary[]; today: string }) {
  const { t, locale } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [active, setActive] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(() => box.current && setWidth(box.current.clientWidth));
    ro.observe(box.current);
    setWidth(box.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = GUTTER;
  }, []);

  const { marks, stack } = useMemo(() => layout(receivables, today, width), [receivables, today, width]);
  const x0 = GUTTER + 20;
  const x1 = width - 28;
  const unit = (x1 - x0) / (SPAN_BEFORE + SPAN_AFTER);
  const xAt = (d: number) => x0 + (d + SPAN_BEFORE) * unit;
  const plotH = Math.max(200, stack + TOOLTIP_ROOM);
  const bucketMarks = marks.filter((m) => m.bucket);
  const ticks = [-30, -15, 0, 15, 30, 45, 60];
  const docDir = locale === "ar" ? "rtl" : "ltr";
  const a = active !== null ? marks[active] : null;

  const dueText = (m: Mark) =>
    m.days < 0
      ? t("due.late", { n: daysLabel(m.days, locale) })
      : m.days === 0
        ? t("due.today")
        : t("due.in", { n: daysLabel(m.days, locale) });

  return (
    <div ref={scroller} className="overflow-x-auto pb-1" dir="ltr">
      <div ref={box} className="relative w-full min-w-[680px]" style={{ height: plotH + AXIS }}>
        <div
          className="absolute top-0 bottom-[60px] bg-foreground-icon-error/5"
          style={{ left: x0, width: xAt(0) - x0 }}
          aria-hidden="true"
        />
        <div
          className="absolute top-0 bottom-[60px] bg-chart-8/10"
          style={{ left: xAt(0), width: xAt(SOON) - xAt(0) }}
          aria-hidden="true"
        />
        <div
          className="absolute top-0 bottom-[60px] border-e border-separator-border"
          style={{ left: 0, width: GUTTER }}
          aria-hidden="true"
        />

        <div dir={docDir} className="absolute top-2 text-caption-1-medium text-text-error-primary" style={{ right: width - xAt(0) + 8 }}>
          {t("dash.zoneLate")}
        </div>
        <div dir={docDir} className="absolute top-2 text-caption-1-medium text-status-yellow-text" style={{ left: xAt(0) + 8 }}>
          {t("dash.zoneSoon", { n: SOON })}
        </div>
        <div dir={docDir} className="absolute top-2 w-[72px] text-center text-caption-1-medium text-text-secondary" style={{ left: 6 }}>
          {t("dash.bucket")}
        </div>

        <div className="absolute bottom-[60px] h-px bg-border-button-hover" style={{ left: 0, right: 0 }} aria-hidden="true" />
        {ticks.map((d) => (
          <div key={d} className="absolute" style={{ left: xAt(d), top: plotH }} aria-hidden="true">
            <div className="h-1.5 w-px bg-border-button-hover" />
            <div className="num -translate-x-1/2 pt-1.5 text-caption-1-medium whitespace-nowrap text-text-tertiary">
              {fmtDate(addDays(today, d)).slice(0, 5)}
            </div>
          </div>
        ))}

        <div
          className="absolute top-0 bottom-[60px] w-px bg-text-primary"
          style={{ left: xAt(0) }}
          aria-hidden="true"
        />
        <div
          dir={docDir}
          className="absolute -translate-x-1/2 rounded-full bg-text-primary px-2.5 py-0.5 text-caption-1-medium whitespace-nowrap text-text-white"
          style={{ left: xAt(0), top: plotH + 30 }}
        >
          {t("dash.today")}
        </div>

        {bucketMarks.length > 0 && (
          <div
            dir={docDir}
            className="absolute w-[84px] text-center text-caption-1-medium whitespace-nowrap text-text-error-primary"
            style={{ left: 0, top: plotH + 10 }}
          >
            {t("dash.bucketCount", { n: bucketMarks.length })}
          </div>
        )}

        {marks.map((m, i) => (
          <Link
            key={m.inv.id}
            href={`/factures/${m.inv.id}`}
            aria-label={`${m.inv.customerName}, ${m.inv.number ?? ""}, ${dueText(m)}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive((v) => (v === i ? null : v))}
            onFocus={() => setActive(i)}
            onBlur={() => setActive((v) => (v === i ? null : v))}
            className={cx(
              "absolute rounded-full opacity-90 shadow-[0_0_0_2px_var(--color-background-primary-default)] transition-transform duration-150 hover:z-10 hover:scale-110 hover:opacity-100 focus-visible:z-10 focus-visible:scale-110 focus-visible:opacity-100 focus-visible:outline-text-primary",
              toneBg[m.tone],
            )}
            style={{
              width: m.r * 2,
              height: m.r * 2,
              left: m.x - m.r,
              top: plotH - m.cy - m.r,
            }}
          />
        ))}

        {a && (
          <div
            dir={docDir}
            role="tooltip"
            className="rise pointer-events-none absolute z-20 w-[230px] rounded-2xl border border-border-button-default bg-background-primary-default p-3 text-body-regular shadow-dropdown"
            style={{
              left: Math.min(Math.max(a.x, 119), width - 119),
              top: plotH - a.cy - a.r - 10,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="truncate text-body-medium text-text-primary">{a.inv.customerName}</div>
            <div className="ident text-caption-1-medium text-text-secondary">{a.inv.number}</div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <Money value={a.remaining} locale={locale} className="text-body-medium text-text-primary" />
              <span className={cx("text-caption-1-medium", toneText[a.tone])}>{dueText(a)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
