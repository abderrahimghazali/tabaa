import { Decimal } from "decimal.js";
import { addDays } from "./dates.js";

// Pure helpers behind the VAT, withholding and payment-terms working papers.
// Dates are ISO "YYYY-MM-DD" strings, amounts decimal strings; rounding is half-up to 2 places.

const money = (d: Decimal.Value) => new Decimal(d).toFixed(2);

export interface ParsedPeriod {
  period: string;
  kind: "MONTH" | "QUARTER";
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Last day of the month that follows the month containing `iso`. */
export function endOfNextMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return endOfMonth(m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`);
}

/** "2026-11" or "2026-Q4"; null when it is neither. */
export function parsePeriod(period: string): ParsedPeriod | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2]|Q[1-4])$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const part = m[2]!;
  if (part.startsWith("Q")) {
    const first = (Number(part[1]) - 1) * 3 + 1;
    return { period, kind: "QUARTER", from: `${year}-${pad(first)}-01`, to: endOfMonth(`${year}-${pad(first + 2)}-01`) };
  }
  return { period, kind: "MONTH", from: `${year}-${part}-01`, to: endOfMonth(`${year}-${part}-01`) };
}

/**
 * Splits `part` (a base or VAT amount of a document worth `gross`) over its payments in order.
 * Each payment gets the change in the rounded cumulative share, so the shares of a fully
 * settled document add up to `part` to the cent. The cumulative share is capped at the gross:
 * anything settled beyond it (stamp duty) is not turnover.
 */
export function prorate(settled: string[], gross: string, part: string): string[] {
  const g = new Decimal(gross);
  if (g.lte(0)) return settled.map(() => "0.00");
  let cumulative = new Decimal(0);
  let before = new Decimal(0);
  return settled.map((s) => {
    cumulative = Decimal.min(g, cumulative.plus(s));
    const upTo = cumulative.times(part).div(g).toDecimalPlaces(2);
    const share = upTo.minus(before);
    before = upTo;
    return money(share);
  });
}

/** Law 69-21: the agreed due date, capped at the legal maximum counted from the issue date. */
export function legalDueDate(issueDate: string, dueDate: string, maxTermDays: number): string {
  const cap = addDays(issueDate, maxTermDays);
  return dueDate < cap ? dueDate : cap;
}

const monthIndex = (iso: string) => {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return y * 12 + m;
};

/**
 * Calendar months of delay started, the delay beginning the day after `legalDue`
 * and running to `until` (settlement date, or the end of the period). Minimum 1.
 */
export function monthsLate(legalDue: string, until: string): number {
  return Math.max(1, monthIndex(until) - monthIndex(addDays(legalDue, 1)) + 1);
}

/** Rate in force on `date`: the latest entry that started on or before it, else the oldest one. */
export function keyRateAt(date: string, rates: { from: string; rate: string }[]): string {
  const sorted = [...rates].sort((a, b) => a.from.localeCompare(b.from));
  const match = sorted.filter((r) => r.from <= date).at(-1) ?? sorted[0];
  if (!match) throw new Error("No key rate");
  return match.rate;
}

/** Key rate on the last day of the first month of delay, plus the increment for each further month. */
export function lateRatePercent(keyRate: string, monthlyIncrement: string, months: number): string {
  return money(new Decimal(keyRate).plus(new Decimal(monthlyIncrement).times(Math.max(0, months - 1))));
}

export function lateFine(amount: string, ratePercent: string): string {
  return money(new Decimal(amount).times(ratePercent).div(100));
}

export function lateDelay(input: {
  legalDue: string;
  until: string;
  amount: string;
  keyRates: { from: string; rate: string }[];
  monthlyIncrement: string;
}) {
  const months = monthsLate(input.legalDue, input.until);
  const firstMonthEnd = endOfMonth(addDays(input.legalDue, 1));
  const ratePercent = lateRatePercent(keyRateAt(firstMonthEnd, input.keyRates), input.monthlyIncrement, months);
  return { monthsLate: months, ratePercent, fine: lateFine(input.amount, ratePercent) };
}
