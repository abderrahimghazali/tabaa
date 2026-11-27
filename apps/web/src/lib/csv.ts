/** CSV for French Excel: ";" separator, UTF-8 with BOM, comma decimals, CRLF. */
export type CsvCell = string | number | null | undefined;

const quote = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** An amount string from the API ("1234.50") as a spreadsheet number ("1234,50"). */
export const csvAmount = (v: string) => v.replace(".", ",");

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const line = (cells: CsvCell[]) => cells.map((c) => quote(c == null ? "" : String(c))).join(";");
  return `﻿${[headers, ...rows].map(line).join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
