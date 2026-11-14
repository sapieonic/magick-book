import { describe, expect, it } from "vitest";
import {
  absoluteTime, businessDay, calendarDaysBetween, daysSince, dueWords, endOfBusinessDay, fromBusinessInput,
  isoDay, longDate, monthKey, monthName, shortDate, startOfBusinessMonth, toBusinessInput,
} from "@/lib/dates";
import { ZONES, useTimeZone } from "../helpers/timezones";

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
    expect(monthName(ist("2026-12-01T01:00:00"))).toBe("December");
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

// datetime-local fields hold IST wall-clock time, so a browser in London or Los Angeles
// must fill and submit the same values as one in India.
describe.each(ZONES)("datetime-local values in IST (browser zone: %s)", (zone) => {
  useTimeZone(zone);

  it("is really running in that zone", () => {
    const offset = { "Europe/London": 0, "America/Los_Angeles": 480 }[zone as string];
    if (offset !== undefined) expect(new Date("2026-11-15T03:30:00Z").getTimezoneOffset()).toBe(offset);
  });

  it("formats an instant as its IST wall-clock time", () => {
    expect(toBusinessInput(new Date("2026-11-15T03:30:00Z"))).toBe("2026-11-15T09:00");
    expect(toBusinessInput("2026-11-14T20:00:59.999Z")).toBe("2026-11-15T01:30");
  });

  it("fills 'Tomorrow 9am' with 9:00 on the IST tomorrow", () => {
    // 02:00 IST on the 14th is still the 13th in London and Los Angeles.
    expect(toBusinessInput(businessDay(ist("2026-11-14T02:00:00"), 1, 9))).toBe("2026-11-15T09:00");
    expect(toBusinessInput(businessDay(ist("2026-11-13T20:00:00"), 1, 9))).toBe("2026-11-14T09:00");
  });

  it("reads a submitted value as IST", () => {
    expect(fromBusinessInput("2026-11-15T09:00")?.toISOString()).toBe("2026-11-15T03:30:00.000Z");
    expect(fromBusinessInput("2027-01-01T00:15")?.toISOString()).toBe("2026-12-31T18:45:00.000Z");
  });

  it("rejects malformed or impossible values", () => {
    for (const bad of ["", "2026-11-15", "2026-11-15 09:00", "2026-11-15T9:00", "2026-11-15T09:00:00", "2026-02-30T09:00", "2026-11-15T24:00", "nope"]) {
      expect(fromBusinessInput(bad), bad).toBeNull();
    }
  });

  it("round-trips any instant to the minute, across DST changes elsewhere", () => {
    const instants = [
      "2026-03-29T00:30:00Z", "2026-03-29T01:30:00Z", // London springs forward
      "2026-03-08T10:30:00Z", "2026-11-01T08:30:00Z", "2026-11-01T09:30:00Z", // Los Angeles
      "2026-12-31T18:29:59.999Z", "2026-12-31T18:30:00Z", "2028-02-29T12:00:00Z",
    ].map((s) => new Date(s));
    // Plus a deterministic spread across a few years.
    for (let t = Date.UTC(2025, 0, 1, 0, 7, 13); t < Date.UTC(2029, 0, 1); t += 9_876_543_211 / 97) instants.push(new Date(t));
    for (const d of instants) {
      const minute = Math.floor(d.getTime() / 60_000) * 60_000;
      expect(fromBusinessInput(toBusinessInput(d))?.getTime(), d.toISOString()).toBe(minute);
    }
  });
});
