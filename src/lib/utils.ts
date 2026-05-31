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

/**
 * Deterministic avatar tint from a string. Returns a tailwind-ish inline style
 * pair (bg + fg) so the same person always gets the same color.
 */
const AVATAR_TINTS = [
  ["#e6e2fd", "#4a39c9"],
  ["#e4f6ec", "#15803d"],
  ["#fbf0d8", "#b45309"],
  ["#e3eefb", "#1d4ed8"],
  ["#fbe6e3", "#be3a31"],
  ["#f3e8fd", "#7e22ce"],
  ["#ddf4f1", "#0f766e"],
];
export function avatarTint(seed: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [bg, fg] = AVATAR_TINTS[h % AVATAR_TINTS.length];
  return { bg, fg };
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
