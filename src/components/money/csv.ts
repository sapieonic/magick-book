/** A CSV cell: text, a plain number (no ₹, no grouping) or blank. */
export type CsvCell = string | number | null | undefined;

/** Text a spreadsheet would run as a formula. */
const FORMULA = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = FORMULA.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV: quotes and commas escaped, CRLF rows. */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

/** Save `rows` as a UTF-8 CSV file (with a BOM so Excel reads ₹ and names correctly). */
export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  const url = URL.createObjectURL(new Blob(["﻿", toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** "Acme & Co statement 2026-11-13.csv" → a filename safe on every OS. */
export function csvFilename(...parts: string[]): string {
  return `${parts.join(" ").replace(/[\\/:*?"<>|]+/g, "-").trim()}.csv`;
}
