export type Locale = "fr" | "ar";

const NBSP = " ";

export function fmtNumber(value: string | number): string {
  const raw = typeof value === "number" ? value.toFixed(2) : value;
  const negative = raw.startsWith("-");
  const [int = "0", dec = ""] = raw.replace("-", "").split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${negative ? "-" : ""}${grouped},${dec.padEnd(2, "0").slice(0, 2)}`;
}

export const currencyLabel = (locale: Locale, code = "MAD") =>
  code === "MAD" ? (locale === "ar" ? "د.م." : "DH") : code;

export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysLabel(n: number, locale: Locale): string {
  const a = Math.abs(n);
  if (locale === "fr") return `${a} j`;
  if (a === 1) return "يوم";
  if (a === 2) return "يومان";
  if (a >= 3 && a <= 10) return `${a} أيام`;
  return `${a} يومًا`;
}

const cents = (s: string) => Math.round(Number(s) * 100);
export const sub = (a: string, b: string) => ((cents(a) - cents(b)) / 100).toFixed(2);
export const add = (a: string, b: string) => ((cents(a) + cents(b)) / 100).toFixed(2);
export const isPositive = (s: string) => cents(s) > 0;

export function toDecimal(input: string, fallback = "0"): string {
  const s = input.replace(/\s/g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? s : fallback;
}

export const digits = (s: string) => s.replace(/\D/g, "");

export function groupDigits(s: string, sizes: number[]): string {
  const d = digits(s);
  const out: string[] = [];
  let i = 0;
  for (const size of sizes) {
    if (i >= d.length) break;
    out.push(d.slice(i, i + size));
    i += size;
  }
  return out.join(" ");
}

export const ICE_GROUPS = [9, 4, 2];
export const RIB_GROUPS = [3, 3, 16, 2];

export function fmtCompact(value: string | number): string {
  const n = Number(value);
  const a = Math.abs(n);
  const f = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
  if (a >= 1_000_000) return `${f(n / 1_000_000)} M`;
  if (a >= 1_000) return `${f(n / 1_000)} k`;
  return String(Math.round(n));
}

const intlLocale = (l: Locale) => (l === "ar" ? "ar-u-nu-latn" : "fr-FR");

export function longDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function monthLabel(ym: string, locale: Locale, style: "short" | "long" = "short"): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: style, timeZone: "UTC" }).format(new Date(`${ym}-15T12:00:00Z`));
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
