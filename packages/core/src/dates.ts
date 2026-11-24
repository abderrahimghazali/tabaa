import type { RulePackage } from "./rules.js";

const DAY_MS = 86_400_000;

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function defaultDueDate(input: {
  issueDate: string;
  deliveryDate?: string;
  termDays?: number;
  rules: RulePackage;
}): string {
  const { rules } = input;
  const term = Math.min(input.termDays ?? rules.defaultPaymentTermDays, rules.maxPaymentTermDays);
  return addDays(input.issueDate, term);
}

/** Whole days from `today` to `date`; negative when `date` is past. */
export function daysUntil(date: string, today: string): number {
  return Math.round((toUtc(date) - toUtc(today)) / DAY_MS);
}

export function isOverdue(dueDate: string, today: string, remaining: string): boolean {
  return dueDate < today && Number(remaining) > 0;
}
