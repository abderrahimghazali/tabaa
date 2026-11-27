import { monthLabel, type Locale } from "./format";

/** A reporting period: a month ("2026-11") or a quarter ("2026-Q4"). */
export type Period = { kind: "month"; year: number; month: number } | { kind: "quarter"; year: number; quarter: number };

export const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2]|Q[1-4])$/;

export function parsePeriod(s: string | undefined | null): Period | null {
  const m = s ? PERIOD_RE.exec(s) : null;
  if (!m) return null;
  const year = Number(m[1]);
  return m[2]!.startsWith("Q") ? { kind: "quarter", year, quarter: Number(m[2]!.slice(1)) } : { kind: "month", year, month: Number(m[2]) };
}

export const formatPeriod = (p: Period) => (p.kind === "month" ? `${p.year}-${String(p.month).padStart(2, "0")}` : `${p.year}-Q${p.quarter}`);

/** The period just before or after, in the same unit. */
export function shiftPeriod(p: Period, by: 1 | -1): Period {
  if (p.kind === "month") {
    const index = p.year * 12 + (p.month - 1) + by;
    return { kind: "month", year: Math.floor(index / 12), month: (index % 12) + 1 };
  }
  const index = p.year * 4 + (p.quarter - 1) + by;
  return { kind: "quarter", year: Math.floor(index / 4), quarter: (index % 4) + 1 };
}

/** Last day (ISO) of a period. */
export function periodEnd(p: Period): string {
  const lastMonth = p.kind === "month" ? p.month : p.quarter * 3;
  const d = new Date(Date.UTC(p.year, lastMonth, 0));
  return d.toISOString().slice(0, 10);
}

/** The most recent period of this kind that is over on `today` (ISO date). */
export function lastFinished(kind: Period["kind"], today: string): Period {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (kind === "month") return shiftPeriod({ kind: "month", year, month }, -1);
  return shiftPeriod({ kind: "quarter", year, quarter: Math.ceil(month / 3) }, -1);
}

export function periodLabel(p: Period, locale: Locale): string {
  if (p.kind === "month") return `${monthLabel(`${p.year}-${String(p.month).padStart(2, "0")}`, locale, "long")} ${p.year}`;
  return locale === "ar" ? `الفصل ${p.quarter} من ${p.year}` : `${p.quarter === 1 ? "1er" : `${p.quarter}e`} trimestre ${p.year}`;
}

/** Whole days from `today` to `date`: positive when the date is still ahead. */
export const daysTo = (date: string, today: string) => Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
