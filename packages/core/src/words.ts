import { Decimal } from "decimal.js";

const FR_UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const FR_TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

// `final`: nothing numeric follows, so "quatre-vingts" and "cents" take their s.
function frBelow100(n: number, final: boolean): string {
  if (n < 20) return FR_UNITS[n]!;
  if (n >= 80) {
    if (n === 80) return final ? "quatre-vingts" : "quatre-vingt";
    return `quatre-vingt-${frBelow100(n - 80, final)}`;
  }
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (tens >= 7) {
    const rest = n - 60;
    return rest === 11 ? "soixante et onze" : `soixante-${FR_UNITS[rest]}`;
  }
  if (unit === 0) return FR_TENS[tens]!;
  if (unit === 1) return `${FR_TENS[tens]} et un`;
  return `${FR_TENS[tens]}-${FR_UNITS[unit]}`;
}

function frBelow1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return frBelow100(r, final);
  const hundreds = h === 1 ? "cent" : `${FR_UNITS[h]} cent${r === 0 && final ? "s" : ""}`;
  return r === 0 ? hundreds : `${hundreds} ${frBelow100(r, final)}`;
}

function frInteger(n: number): string {
  if (n === 0) return "zéro";
  const scales: [number, string][] = [[1e9, "milliard"], [1e6, "million"]];
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of scales) {
    const g = Math.floor(rest / size);
    rest %= size;
    if (g > 0) parts.push(`${frBelow1000(g, true)} ${name}${g > 1 ? "s" : ""}`);
  }
  const thousands = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousands === 1) parts.push("mille");
  else if (thousands > 1) parts.push(`${frBelow1000(thousands, false)} mille`);
  if (rest > 0) parts.push(frBelow1000(rest, true));
  return parts.join(" ");
}

function frUnit(n: number, word: string): string {
  return `${frInteger(n)} ${word}${n > 1 ? "s" : ""}`;
}

const AR_UNITS = [
  "صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة",
  "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر",
  "ثمانية عشر", "تسعة عشر",
];
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = [
  "", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة",
];

function arBelow100(n: number): string {
  if (n < 20) return AR_UNITS[n]!;
  const unit = n % 10;
  return unit === 0 ? AR_TENS[n / 10]! : `${AR_UNITS[unit]} و${AR_TENS[Math.floor(n / 10)]}`;
}

// `construct`: the number is directly followed by a counted noun, so the dual
// hundreds lose their final -ān ("مائتا ألف").
function arBelow1000(n: number, construct: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h === 0) return arBelow100(r);
  let hundreds = AR_HUNDREDS[h]!;
  if (h === 2 && r === 0 && construct) hundreds = "مائتا";
  return r === 0 ? hundreds : `${hundreds} و${arBelow100(r)}`;
}

// Counted-noun form follows the last two digits of the number: 1 and 2 (alone)
// singular/dual, 3-10 plural, 11-99 accusative singular (also 101, 102...),
// exact hundreds genitive singular. `last`: the group directly precedes the
// currency noun ("أحد عشر ألف درهم", "ألفا درهم"), so it goes genitive.
type NounForms = { one: string; two: string; plural: string; accusative: string; genitive: string };

function arCounted(n: number, f: NounForms, last: boolean): string {
  const tail = n % 100;
  if (n === 1) return f.one;
  if (n === 2) return last ? f.two.slice(0, -1) : f.two;
  if (tail === 0) return `${arBelow1000(n, true)} ${f.genitive}`;
  const form = tail >= 3 && tail <= 10 ? f.plural : last ? f.genitive : f.accusative;
  return `${arBelow1000(n, true)} ${form}`;
}

const AR_SCALES: [number, NounForms][] = [
  [1e9, { one: "مليار", two: "ملياران", plural: "مليارات", accusative: "مليارًا", genitive: "مليار" }],
  [1e6, { one: "مليون", two: "مليونان", plural: "ملايين", accusative: "مليونًا", genitive: "مليون" }],
  [1e3, { one: "ألف", two: "ألفان", plural: "آلاف", accusative: "ألفًا", genitive: "ألف" }],
];

function arInteger(n: number, construct: boolean): string {
  const parts: string[] = [];
  let rest = n;
  for (const [size, forms] of AR_SCALES) {
    const g = Math.floor(rest / size);
    rest %= size;
    if (g > 0) parts.push(arCounted(g, forms, construct && rest === 0));
  }
  if (rest > 0) parts.push(arBelow1000(rest, construct));
  return parts.join(" و");
}

const AR_DIRHAM: NounForms = { one: "درهم واحد", two: "درهمان", plural: "دراهم", accusative: "درهمًا", genitive: "درهم" };
const AR_CENTIME: NounForms = { one: "سنتيم واحد", two: "سنتيمان", plural: "سنتيمات", accusative: "سنتيمًا", genitive: "سنتيم" };

function arMoney(n: number, f: NounForms): string {
  if (n === 0) return `صفر ${f.genitive}`;
  if (n <= 2) return n === 1 ? f.one : f.two;
  const tail = n % 100;
  const noun = tail === 0 ? f.genitive : tail >= 3 && tail <= 10 ? f.plural : f.accusative;
  return `${arInteger(n, tail === 0)} ${noun}`;
}

/** Amount in dirhams and centimes, spelled out. `amount` is a decimal string. */
export function amountInWords(amount: string, lang: "fr" | "ar"): string {
  const value = new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const negative = value.isNegative() && !value.isZero();
  const abs = value.abs();
  const dirhams = abs.trunc().toNumber();
  const centimes = abs.minus(abs.trunc()).times(100).toNumber();

  if (lang === "fr") {
    const dirhamPart =
      dirhams === 0
        ? "zéro dirham"
        : dirhams % 1_000_000 === 0
          ? `${frInteger(dirhams)} de dirhams`
          : frUnit(dirhams, "dirham");
    const text = centimes === 0 ? dirhamPart : `${dirhamPart} et ${frUnit(centimes, "centime")}`;
    return negative ? `moins ${text}` : text;
  }

  const dirhamPart = arMoney(dirhams, AR_DIRHAM);
  const text = centimes === 0 ? dirhamPart : `${dirhamPart} و${arMoney(centimes, AR_CENTIME)}`;
  return negative ? `ناقص ${text}` : text;
}
