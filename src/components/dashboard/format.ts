import { differenceInCalendarDays, differenceInCalendarMonths, format, setHours, startOfDay, addDays } from "date-fns";
import { formatMoney } from "@/components/ui/Money";
import type { DashboardData } from "@/lib/types";

/** "1 lead" / "3 leads". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Elapsed time in words for "last touched" columns: "today", "17 days", "4 months". */
export function ageWords(date: string | Date, now: Date): string {
  const days = differenceInCalendarDays(now, new Date(date));
  if (days <= 0) return "today";
  if (days < 30) return plural(days, "day");
  const months = Math.max(1, differenceInCalendarMonths(now, new Date(date)));
  return months < 12 ? plural(months, "month") : plural(Math.floor(months / 12), "year");
}

export function daysSince(date: string | Date, now: Date): number {
  return differenceInCalendarDays(now, new Date(date));
}

/** Due time relative to today: "due today", "due 3 days ago", "due tomorrow". */
export function dueWords(date: string, now: Date): string {
  const days = differenceInCalendarDays(new Date(date), now);
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return days < 0 ? `due ${plural(-days, "day")} ago` : `due in ${plural(days, "day")}`;
}

/** Tomorrow at 9:00 local time: where a snoozed item lands. */
export function tomorrowMorning(now: Date): Date {
  return setHours(startOfDay(addDays(now, 1)), 9);
}

export const longDate = (d: Date) => format(d, "EEEE, d MMMM yyyy");
export const shortDay = (d: Date) => format(d, "EEE d");
export const monthName = (d: Date) => format(d, "MMMM");

/** A sentence fragment; `strong` parts carry the figures. */
export interface Phrase {
  text: string;
  strong?: boolean;
}

/** The Today header's one-sentence brief, built from live data. */
export function summaryPhrases(d: DashboardData): Phrase[] {
  const out: Phrase[] = [];
  if (d.openLeads > 0) {
    out.push({ text: plural(d.openLeads, "open lead"), strong: true }, { text: " worth " });
    out.push({ text: formatMoney(d.openValue, true), strong: true }, { text: ". " });
  } else {
    out.push({ text: "No open leads", strong: true }, { text: ". " });
  }

  const { outstanding, owingAccounts } = d.receivables;
  if (outstanding > 0) {
    out.push({ text: `${formatMoney(outstanding, true)} is outstanding`, strong: true });
    out.push({ text: ` across ${plural(owingAccounts, "account")}. ` });
  } else {
    out.push({ text: "Nothing is outstanding. " });
  }

  const followUps = d.queue.filter((q) => q.kind !== "invoice").length;
  if (followUps > 0) {
    out.push({ text: plural(followUps, "follow-up"), strong: true }, { text: followUps === 1 ? " is waiting" : " are waiting" });
  } else {
    out.push({ text: "No follow-ups are waiting" });
  }

  if (d.wonThisMonth > 0) {
    out.push({ text: ", and " }, { text: plural(d.wonThisMonth, "lead"), strong: true }, { text: " won this month." });
  } else {
    out.push({ text: ", and nothing has been won yet this month." });
  }
  return out;
}

/** "down from ₹5.9L in October", "up from…", "same as…", "nothing in October". */
export function collectedComparison(thisMonth: number, lastMonth: number, lastMonthName: string): string {
  if (lastMonth === 0) return `nothing collected in ${lastMonthName}`;
  const prev = `${formatMoney(lastMonth, true)} in ${lastMonthName}`;
  if (thisMonth === lastMonth) return `the same as ${lastMonthName}`;
  return thisMonth > lastMonth ? `up from ${prev}` : `down from ${prev}`;
}
