import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as Indian Rupees in full, e.g. ₹1,20,000.
 */
export function formatINR(amount: number): string {
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(amount));
}

/** "1,10,000" or "₹ 6200" → 110000 / 6200; anything unparseable → 0. */
export function parseAmount(raw: string): number {
  return Number(raw.replace(/[^\d.]/g, "")) || 0;
}

/** Human-readable file size, e.g. 824 KB, 3.1 MB. */
export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compact Indian currency, e.g. ₹4.2L, ₹1.1Cr, ₹85k, ₹420.
 * Mirrors the lakh/crore shorthand used across the wireframes.
 */
export function formatINRCompact(amount: number): string {
  const n = Math.round(amount);
  if (n >= 10000000) return "₹" + trimZero(n / 10000000) + "Cr";
  if (n >= 100000) return "₹" + trimZero(n / 100000) + "L";
  if (n >= 1000) return "₹" + trimZero(n / 1000) + "k";
  return "₹" + n;
}

function trimZero(v: number): string {
  const s = v.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** Initials for an avatar, e.g. "Priya Sharma" → "PS" (max 2). */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Absolute, locale-aware timestamp for tooltips, e.g. "1 Jun 2026, 4:05 pm". */
export function absoluteTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** "2h ago", "3d ago", "1mo ago" — short relative time. */
export function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/** Whole days elapsed since `date` (0 for today or a future/invalid date). */
export function daysSince(date: Date | string, now: Date | number = Date.now()): number {
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Number(now) - t) / 86_400_000));
}

/** "1 lead" / "3 leads"; pass `many` for irregular plurals. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** An age written in words: "Today", "1 day", "17 days", "3 months", "2 years". */
export function ageInWords(days: number): string {
  if (days < 1) return "Today";
  if (days < 30) return plural(days, "day");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

/** "today" or "17 days ago": an age for the middle of a sentence. */
export function agoInWords(days: number): string {
  return days < 1 ? "today" : `${ageInWords(days).toLowerCase()} ago`;
}

/** Short calendar date in en-IN, e.g. "14 Jul 2026" (or "14 Jul" with `withYear` false). */
export function shortDate(date: Date | string, withYear = true): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear && { year: "numeric" }) });
}
