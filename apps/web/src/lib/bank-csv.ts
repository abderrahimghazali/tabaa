/**
 * Bank statement CSV parsing, in the browser. Pure functions: no DOM, no network.
 * Handles ";" "," tab and "|" separators, quoted fields, UTF-8 (BOM) and Windows-1252,
 * preamble lines, dd/mm/yyyy dd-mm-yy and ISO dates, comma or dot decimals with any thousands
 * separator, one signed amount column or separate debit and credit columns, and totals lines.
 */

export const MAX_LINES = 2000;
export const SEPARATORS = [";", ",", "\t", "|"] as const;
export type Separator = (typeof SEPARATORS)[number];

export type Cell = string;
export type Row = { cells: Cell[]; line: number };

export function decodeBytes(bytes: ArrayBuffer | Uint8Array): { text: string; encoding: "utf-8" | "windows-1252" } {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let start = 0;
  if (view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) start = 3;
  const body = view.subarray(start);
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(body), encoding: "windows-1252" };
  }
}

export function splitRows(text: string, separator: Separator): Row[] {
  const rows: Row[] = [];
  let cells: Cell[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endCell = () => {
    cells.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push({ cells, line: rowLine });
    cells = [];
  };
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === "\n") line++;
        cell += c;
      }
    } else if (c === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (c === separator) endCell();
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      endRow();
      line++;
      rowLine = line;
    } else cell += c;
  }
  if (cell !== "" || cells.length > 0) endRow();
  return rows.map((r) => ({ ...r, cells: r.cells.map((x) => x.trim()) })).filter((r) => r.cells.some((x) => x !== ""));
}

/** The separator that gives the most rows the same, widest column count. */
export function detectSeparator(text: string): Separator {
  const sample = text.split(/\r\n|\r|\n/).slice(0, 60).join("\n");
  let best: Separator = ";";
  let bestScore = -1;
  for (const sep of SEPARATORS) {
    const rows = splitRows(sample, sep);
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.cells.length, (counts.get(r.cells.length) ?? 0) + 1);
    let mode = 1;
    let modeRows = 0;
    for (const [n, k] of counts) if (n > 1 && (k > modeRows || (k === modeRows && n > mode))) [mode, modeRows] = [n, k];
    const score = modeRows * 100 + mode;
    if (modeRows > 0 && score > bestScore) {
      best = sep;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy and yyyy-mm-dd (a trailing time is ignored). Day first: never mm/dd. */
export function parseDate(input: string): string | null {
  const s = input.trim().replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?Z?$/, "");
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4}|\d{2})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(y, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

// ---------------------------------------------------------------- amounts

export type DecimalMark = "," | ".";

/**
 * Signed decimal string ("-1234.50") or null. Spaces, no-break spaces, apostrophes and currency
 * words are dropped; "(12,00)" and "12,00-" are negative. A single comma or dot followed by three digits
 * is ambiguous ("1,234"): `mark` decides, the file's usual decimal mark.
 */
export function parseAmount(input: string, mark: DecimalMark = ","): string | null {
  let s = input.replace(/[\s  ']/g, "").replace(/(MAD|DHS?|DH|MRU)$/i, "").replace(/^(MAD|DHS?|DH)/i, "");
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const last = Math.max(lastComma, lastDot);
  let intPart = s;
  let frac = "";
  if (last >= 0) {
    const ch = s[last]!;
    const other = ch === "," ? "." : ",";
    const after = s.length - last - 1;
    const once = s.split(ch).length - 1 === 1;
    const decimal = s.includes(other) ? once && s.lastIndexOf(other) < last : once && (after !== 3 || ch === mark);
    if (decimal) {
      intPart = s.slice(0, last);
      frac = s.slice(last + 1);
    }
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (intPart === "" && frac === "") return null;
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac) || frac.length > 6) return null;
  const value = `${intPart.replace(/^0+(?=\d)/, "") || "0"}${frac ? `.${frac}` : ""}`;
  if (/^0(\.0+)?$/.test(value)) return "0";
  if (intPart.length > 13) return null;
  return negative ? `-${value}` : value;
}

/** The decimal mark this file uses: whichever a cell with 1 or 2 decimals shows, comma by default. */
export function detectDecimalMark(cells: string[]): DecimalMark {
  let comma = 0;
  let dot = 0;
  for (const c of cells) {
    const s = c.replace(/[\s  ]/g, "");
    if (/^[-+(]?\d[\d.]*,\d{1,2}[)-]?$/.test(s)) comma++;
    else if (/^[-+(]?\d[\d,]*\.\d{1,2}[)-]?$/.test(s)) dot++;
  }
  return dot > comma ? "." : ",";
}

// ---------------------------------------------------------------- structure

export type Mapping = {
  date: number;
  label: number;
  mode: "signed" | "split";
  amount: number;
  debit: number;
  credit: number;
  reference: number | null;
};

export type Analysis = {
  separator: Separator;
  rows: Row[];
  /** Index in `rows` of the header, or null when the file has none. */
  headerIndex: number | null;
  headers: string[];
  columns: number;
  mapping: Mapping;
  decimalMark: DecimalMark;
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const HEADER_WORDS = /\b(date|libelle|designation|description|operation|montant|debit|credit|solde|reference|ref|valeur|intitule|motif|amount|label|details?|nature)\b/;

const ROLE: Record<"date" | "label" | "amount" | "debit" | "credit" | "reference", RegExp[]> = {
  date: [/^date( de)? operation$/, /^date( comptable)?$/, /^date/, /^jour$/],
  label: [/^libelle( operation)?$/, /^libelle/, /^designation/, /^description/, /^intitule/, /^motif/, /^details?$/, /^operation$/, /^nature/, /^label$/],
  amount: [/^montant$/, /^montant/, /^amount$/, /^somme$/],
  debit: [/^debit/, /^retrait/, /^sortie/, /^paiement/, /^depense/],
  credit: [/^credit/, /^versement/, /^entree/, /^recette/, /^depot/],
  reference: [/^(n |no )?(de )?ref/, /^reference/, /^numero/, /^n$/, /^num/, /^cheque/],
};

function findCol(headers: string[], res: RegExp[], taken: Set<number>): number {
  for (const re of res) {
    const i = headers.findIndex((h, idx) => !taken.has(idx) && re.test(norm(h)));
    if (i >= 0) return i;
  }
  return -1;
}

const looksLikeDate = (s: string) => parseDate(s) !== null;
const looksLikeAmount = (s: string) => /\d/.test(s) && parseAmount(s, ",") !== null && !looksLikeDate(s);

function findHeader(rows: Row[]): number | null {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const cells = rows[i]!.cells;
    const hits = cells.filter((c) => c !== "" && !looksLikeDate(c) && HEADER_WORDS.test(norm(c))).length;
    if (hits >= 2) return i;
  }
  return null;
}

function guessByContent(data: Row[], columns: number, taken: Set<number>) {
  const sample = data.slice(0, 40);
  const score = (fn: (s: string) => boolean) =>
    Array.from({ length: columns }, (_, c) => sample.filter((r) => (r.cells[c] ?? "") !== "" && fn(r.cells[c]!)).length);
  const dates = score(looksLikeDate);
  const amounts = score((s) => looksLikeAmount(s) && /[.,]\d{1,2}$|^\D*\d+$/.test(s.replace(/\s/g, "")));
  const texts = Array.from({ length: columns }, (_, c) =>
    sample.reduce((n, r) => n + ((r.cells[c] ?? "").length > 6 && !looksLikeDate(r.cells[c]!) && !looksLikeAmount(r.cells[c]!) ? 1 : 0), 0),
  );
  const best = (arr: number[]) => {
    let bi = -1;
    let bv = 0;
    arr.forEach((v, i) => {
      if (!taken.has(i) && v > bv) [bi, bv] = [i, v];
    });
    return bi;
  };
  return { date: best(dates), label: best(texts), amounts };
}

export function analyze(text: string, override: { separator?: Separator; headerIndex?: number | null } = {}): Analysis {
  const separator = override.separator ?? detectSeparator(text);
  const rows = splitRows(text, separator);
  const headerIndex = override.headerIndex !== undefined ? override.headerIndex : findHeader(rows);
  const dataRows = rows.slice(headerIndex === null ? 0 : headerIndex + 1);
  const headers = headerIndex === null ? [] : rows[headerIndex]!.cells;
  const columns = Math.max(headers.length, ...dataRows.slice(0, 200).map((r) => r.cells.length), 0);
  const taken = new Set<number>();
  let date = findCol(headers, ROLE.date, taken);
  if (date >= 0) taken.add(date);
  const credit = findCol(headers, ROLE.credit, taken);
  if (credit >= 0) taken.add(credit);
  const debit = findCol(headers, ROLE.debit, taken);
  if (debit >= 0) taken.add(debit);
  let label = findCol(headers, ROLE.label, taken);
  if (label >= 0) taken.add(label);
  let amount = debit >= 0 && credit >= 0 ? -1 : findCol(headers, ROLE.amount, taken);
  if (amount >= 0) taken.add(amount);
  const reference = findCol(headers, ROLE.reference, taken);

  const content = guessByContent(dataRows, columns, taken);
  if (date < 0) date = content.date;
  if (label < 0) label = content.label;
  const mode: Mapping["mode"] = debit >= 0 && credit >= 0 ? "split" : "signed";
  if (mode === "signed" && amount < 0) {
    const cand = content.amounts.map((n, i) => [n, i] as const).filter(([n, i]) => n > 0 && i !== date && i !== label).sort((a, b) => b[0] - a[0]);
    amount = cand[0]?.[1] ?? -1;
    // Two numeric columns with a header we could not read: treat them as débit then crédit.
    if (cand.length >= 2 && headers.length === 0) {
      const [a, b] = [cand[0]![1], cand[1]![1]].sort((x, y) => x - y);
      return finish(separator, rows, headerIndex, headers, columns, { date, label, mode: "split", amount: -1, debit: a!, credit: b!, reference: reference >= 0 ? reference : null }, dataRows);
    }
  }
  return finish(separator, rows, headerIndex, headers, columns, { date, label, mode, amount, debit, credit, reference: reference >= 0 ? reference : null }, dataRows);
}

function finish(separator: Separator, rows: Row[], headerIndex: number | null, headers: string[], columns: number, mapping: Mapping, dataRows: Row[]): Analysis {
  const cols = [mapping.mode === "signed" ? mapping.amount : mapping.debit, mapping.mode === "signed" ? -1 : mapping.credit];
  const cells = dataRows.flatMap((r) => cols.filter((c) => c >= 0).map((c) => r.cells[c] ?? "")).filter(Boolean);
  return { separator, rows, headerIndex, headers, columns, mapping, decimalMark: detectDecimalMark(cells) };
}

// ---------------------------------------------------------------- lines

export type ErrorCode = "BAD_DATE" | "BAD_AMOUNT" | "NO_AMOUNT" | "ZERO_AMOUNT";
export type RowError = { line: number; code: ErrorCode; raw: string };
export type BankLine = { date: string; label: string; amount: string; reference?: string; line: number };

export type Built = {
  lines: BankLine[];
  errors: RowError[];
  /** Rows left out on purpose: blank, totals, balances. */
  ignored: number;
  received: string;
  paidOut: string;
  from: string | null;
  to: string | null;
  tooMany: boolean;
};

const TOTAL_LABEL = /^(total|totaux|sous total|solde|report|ancien solde|nouveau solde|cumul|nombre)\b/;

const cents = (amount: string) => {
  const neg = amount.startsWith("-");
  const [i, f = ""] = amount.replace("-", "").split(".");
  const v = Number(i) * 100 + Number((f + "00").slice(0, 2)) + (f.length > 2 && Number(f[2]) >= 5 ? 1 : 0);
  return neg ? -v : v;
};
export const fmtCents = (c: number) => `${c < 0 ? "-" : ""}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`;

export function buildLines(a: Analysis, mapping: Mapping = a.mapping, mark: DecimalMark = a.decimalMark): Built {
  const data = a.rows.slice(a.headerIndex === null ? 0 : a.headerIndex + 1);
  const lines: BankLine[] = [];
  const errors: RowError[] = [];
  let ignored = 0;
  let received = 0;
  let paidOut = 0;
  const get = (r: Row, i: number | null) => (i === null || i < 0 ? "" : (r.cells[i] ?? ""));
  for (const r of data) {
    const rawDate = get(r, mapping.date);
    const label = get(r, mapping.label).replace(/\s+/g, " ").trim();
    const raw = r.cells.join(" | ");
    const date = parseDate(rawDate);
    const hasAmountCell = mapping.mode === "signed" ? get(r, mapping.amount) !== "" : get(r, mapping.debit) !== "" || get(r, mapping.credit) !== "";
    if (!date) {
      const first = norm(r.cells.find((c) => c !== "") ?? "");
      if (rawDate === "" || TOTAL_LABEL.test(norm(label)) || TOTAL_LABEL.test(first)) {
        ignored++;
        continue;
      }
      errors.push({ line: r.line, code: "BAD_DATE", raw });
      continue;
    }
    if (TOTAL_LABEL.test(norm(label))) {
      ignored++;
      continue;
    }
    let amount: string | null;
    if (mapping.mode === "signed") {
      const cell = get(r, mapping.amount);
      if (cell === "") {
        errors.push({ line: r.line, code: "NO_AMOUNT", raw });
        continue;
      }
      amount = parseAmount(cell, mark);
    } else {
      const d = get(r, mapping.debit);
      const c = get(r, mapping.credit);
      const dv = d === "" ? null : parseAmount(d, mark);
      const cv = c === "" ? null : parseAmount(c, mark);
      if (!hasAmountCell) {
        errors.push({ line: r.line, code: "NO_AMOUNT", raw });
        continue;
      }
      if ((d !== "" && dv === null) || (c !== "" && cv === null)) amount = null;
      else {
        const out = dv === null ? 0 : Math.abs(cents(dv));
        const inn = cv === null ? 0 : Math.abs(cents(cv));
        amount = fmtCents(inn - out);
      }
    }
    if (amount === null) {
      errors.push({ line: r.line, code: "BAD_AMOUNT", raw });
      continue;
    }
    const c = cents(amount);
    if (c === 0) {
      errors.push({ line: r.line, code: "ZERO_AMOUNT", raw });
      continue;
    }
    const reference = get(r, mapping.reference).replace(/\s+/g, " ").trim().slice(0, 100);
    lines.push({
      date,
      label: (label || reference || "-").slice(0, 300),
      amount: fmtCents(c),
      ...(reference ? { reference } : {}),
      line: r.line,
    });
    if (c > 0) received += c;
    else paidOut += -c;
  }
  const dates = lines.map((l) => l.date).sort();
  return {
    lines,
    errors,
    ignored,
    received: fmtCents(received),
    paidOut: fmtCents(paidOut),
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    tooMany: lines.length > MAX_LINES,
  };
}
