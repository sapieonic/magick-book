/**
 * Calendar maths and date formatting in the business time zone.
 *
 * MagickBook runs on Indian time: "today", "this month", "overdue by 3 days"
 * and every date on screen mean the same thing on the server (UTC hosts) and
 * in every browser. IST is a fixed +05:30 with no daylight saving, so calendar
 * parts are read by shifting the instant and using UTC getters.
 */

type DateLike = Date | string | number;

export const BUSINESS_TZ = "Asia/Kolkata";
export const DAY_MS = 86_400_000;
const OFFSET_MS = 330 * 60_000;

const toDate = (d: DateLike) => (d instanceof Date ? d : new Date(d));
/** The instant shifted so its UTC getters read IST wall-clock time. */
const wall = (d: DateLike) => new Date(toDate(d).getTime() + OFFSET_MS);
/** IST wall-clock parts back to the real instant. */
const fromWall = (y: number, m: number, day: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m, day, h, min) - OFFSET_MS);

/** Whole IST calendar days from `b` to `a` (a − b): 0 on the same day, 1 if `a` is the next day. */
export function calendarDaysBetween(a: DateLike, b: DateLike): number {
  const da = wall(a);
  const db = wall(b);
  const a0 = Date.UTC(da.getUTCFullYear(), da.getUTCMonth(), da.getUTCDate());
  const b0 = Date.UTC(db.getUTCFullYear(), db.getUTCMonth(), db.getUTCDate());
  return Math.round((a0 - b0) / DAY_MS);
}

/** Whole calendar days since `date` (0 for today, a future date or an invalid one). */
export function daysSince(date: DateLike, now: DateLike = Date.now()): number {
  if (Number.isNaN(toDate(date).getTime())) return 0;
  return Math.max(0, calendarDaysBetween(now, date));
}

/** Midnight IST of `d`'s day, `addDays` days later, at `hour`:00 (e.g. tomorrow 9am: `businessDay(now, 1, 9)`). */
export function businessDay(d: DateLike, addDays = 0, hour = 0): Date {
  const w = wall(d);
  return fromWall(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() + addDays, hour);
}

/** The last millisecond of `d`'s IST day. */
export function endOfBusinessDay(d: DateLike): Date {
  return new Date(businessDay(d, 1).getTime() - 1);
}

/** Midnight IST on the first of the month `monthsAgo` months before `d`'s month. */
export function startOfBusinessMonth(d: DateLike, monthsAgo = 0): Date {
  const w = wall(d);
  return fromWall(w.getUTCFullYear(), w.getUTCMonth() - monthsAgo, 1);
}

/** "2026-11": the IST calendar month an instant falls in. */
export function monthKey(d: DateLike): string {
  const w = wall(d);
  return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-11-13": the IST calendar day, for `<input type="date">` values and date-only fields. */
export function isoDay(d: DateLike = Date.now()): string {
  return wall(d).toISOString().slice(0, 10);
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: BUSINESS_TZ, ...opts });
const SHORT = fmt({ day: "numeric", month: "short" });
const SHORT_YEAR = fmt({ day: "numeric", month: "short", year: "numeric" });
const LONG = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const WEEKDAY_DAY = fmt({ weekday: "short", day: "numeric" });
const MONTH_YEAR = fmt({ month: "long", year: "numeric" });
const MONTH = fmt({ month: "long" });
const DATE_TIME = fmt({ dateStyle: "medium", timeStyle: "short" });

const valid = (d: DateLike) => !Number.isNaN(toDate(d).getTime());

/**
 * "7 Nov 2026". `year: "auto"` drops the year when the date is in the current
 * year ("7 Nov"); `false` always drops it.
 */
export function shortDate(date: DateLike, year: boolean | "auto" = true, now: DateLike = Date.now()): string {
  if (!valid(date)) return "";
  const withYear = year === "auto" ? wall(date).getUTCFullYear() !== wall(now).getUTCFullYear() : year;
  return (withYear ? SHORT_YEAR : SHORT).format(toDate(date));
}

/** "Friday, 13 November 2026". */
export const longDate = (date: DateLike) => (valid(date) ? LONG.format(toDate(date)) : "");
/** "Fri 13". */
export const weekdayDay = (date: DateLike) => (valid(date) ? WEEKDAY_DAY.format(toDate(date)) : "");
/** "November". */
export const monthName = (date: DateLike) => (valid(date) ? MONTH.format(toDate(date)) : "");
/** "November 2026". */
export const monthYear = (date: DateLike) => (valid(date) ? MONTH_YEAR.format(toDate(date)) : "");
/** "13 Nov 2026, 4:05 pm": tooltips and stored activity text. */
export const absoluteTime = (date: DateLike) => (valid(date) ? DATE_TIME.format(toDate(date)) : "");

/** Calendar-day words relative to today: "due today", "due tomorrow", "due in 3 days", "due 2 days ago". */
export function dueWords(date: DateLike, now: DateLike = Date.now()): string {
  const days = calendarDaysBetween(date, now);
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  const n = Math.abs(days);
  const span = `${n} ${n === 1 ? "day" : "days"}`;
  return days < 0 ? `due ${span} ago` : `due in ${span}`;
}
