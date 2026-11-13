import { describe, expect, it } from "vitest";
import {
  absoluteTime, businessDay, calendarDaysBetween, daysSince, dueWords, endOfBusinessDay,
  isoDay, longDate, monthKey, shortDate, startOfBusinessMonth,
} from "@/lib/dates";

// Instants written in IST (+05:30) so the expectations read as an Indian user sees them.
const ist = (s: string) => new Date(`${s}+05:30`);

describe("dates (business time zone: IST)", () => {
  it("counts IST calendar days, not UTC ones", () => {
    // 02:00 IST on the 14th is still the 13th in UTC.
    expect(calendarDaysBetween(ist("2026-11-14T02:00:00"), ist("2026-11-13T23:00:00"))).toBe(1);
    expect(calendarDaysBetween(ist("2026-11-13T23:59:00"), ist("2026-11-13T00:00:00"))).toBe(0);
    expect(calendarDaysBetween(ist("2026-11-12T10:00:00"), ist("2026-11-13T10:00:00"))).toBe(-1);
  });

  it("counts days across a year boundary", () => {
    expect(calendarDaysBetween(ist("2027-01-01T01:00:00"), ist("2026-12-31T23:00:00"))).toBe(1);
  });

  it("daysSince never goes negative and ignores invalid dates", () => {
    const now = ist("2026-11-13T10:00:00");
    expect(daysSince(ist("2026-11-10T22:00:00"), now)).toBe(3);
    expect(daysSince(ist("2026-11-20T10:00:00"), now)).toBe(0);
    expect(daysSince("nope", now)).toBe(0);
  });

  it("builds IST day and month boundaries", () => {
    const now = ist("2026-11-01T03:00:00"); // still 31 Oct in UTC
    expect(businessDay(now).toISOString()).toBe(ist("2026-11-01T00:00:00").toISOString());
    expect(businessDay(now, 1, 9).toISOString()).toBe(ist("2026-11-02T09:00:00").toISOString());
    expect(endOfBusinessDay(now).getTime()).toBe(ist("2026-11-02T00:00:00").getTime() - 1);
    expect(startOfBusinessMonth(now).toISOString()).toBe(ist("2026-11-01T00:00:00").toISOString());
    expect(startOfBusinessMonth(ist("2026-01-15T12:00:00"), 1).toISOString()).toBe(ist("2025-12-01T00:00:00").toISOString());
    expect(monthKey(now)).toBe("2026-11");
    expect(isoDay(now)).toBe("2026-11-01");
  });

  it("formats in IST whatever the host time zone", () => {
    const d = ist("2026-11-14T02:00:00");
    expect(shortDate(d)).toBe("14 Nov 2026");
    expect(shortDate(d, false)).toBe("14 Nov");
    expect(shortDate(d, "auto", ist("2026-01-01T00:00:00"))).toBe("14 Nov");
    expect(shortDate(d, "auto", ist("2027-01-01T00:00:00"))).toBe("14 Nov 2026");
    expect(longDate(d)).toBe("Saturday, 14 November 2026");
    expect(absoluteTime(d)).toMatch(/14 Nov 2026, 2:00\s?am/i);
    expect(shortDate("bad")).toBe("");
  });

  it("phrases due dates by calendar day", () => {
    const now = ist("2026-11-13T19:13:00");
    expect(dueWords(ist("2026-11-14T09:00:00"), now)).toBe("due tomorrow");
    expect(dueWords(ist("2026-11-13T23:00:00"), now)).toBe("due today");
    expect(dueWords(ist("2026-11-16T09:00:00"), now)).toBe("due in 3 days");
    expect(dueWords(ist("2026-11-12T09:00:00"), now)).toBe("due 1 day ago");
  });
});
