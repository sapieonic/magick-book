import { describe, it, expect, vi, afterEach } from "vitest";
import { formatINR, formatINRCompact, initials, relativeTime, daysSince, ageInWords, agoInWords, plural, parseAmount } from "@/lib/utils";

describe("formatINR", () => {
  it("formats with the Indian grouping and a rupee sign", () => {
    expect(formatINR(120000)).toBe("₹1,20,000");
    expect(formatINR(1000)).toBe("₹1,000");
    expect(formatINR(0)).toBe("₹0");
  });
  it("rounds to a whole number", () => {
    expect(formatINR(1234.6)).toBe("₹1,235");
    expect(formatINR(1234.4)).toBe("₹1,234");
  });
});

describe("formatINRCompact", () => {
  it("uses crore above 1,00,00,000", () => {
    expect(formatINRCompact(10000000)).toBe("₹1Cr");
    expect(formatINRCompact(12000000)).toBe("₹1.2Cr");
  });
  it("uses lakh between 1,00,000 and 1Cr", () => {
    expect(formatINRCompact(100000)).toBe("₹1L");
    expect(formatINRCompact(420000)).toBe("₹4.2L");
    expect(formatINRCompact(9999999)).toBe("₹100L"); // just under a crore
  });
  it("uses k between 1,000 and 1L", () => {
    expect(formatINRCompact(1000)).toBe("₹1k");
    expect(formatINRCompact(85000)).toBe("₹85k");
  });
  it("shows raw rupees below 1,000", () => {
    expect(formatINRCompact(420)).toBe("₹420");
    expect(formatINRCompact(0)).toBe("₹0");
  });
  it("trims a trailing .0", () => {
    expect(formatINRCompact(2000000)).toBe("₹20L");
  });
});

describe("initials", () => {
  it("takes up to two uppercased initials", () => {
    expect(initials("Priya Sharma")).toBe("PS");
    expect(initials("madonna")).toBe("M");
    expect(initials("Jean Luc Picard")).toBe("JL");
  });
  it("collapses extra whitespace", () => {
    expect(initials("  Priya   Sharma  ")).toBe("PS");
  });
  it("returns empty string for empty input", () => {
    expect(initials("")).toBe("");
  });
});

describe("daysSince", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  it("counts whole days elapsed", () => {
    expect(daysSince("2026-11-13T01:00:00Z", now)).toBe(0);
    expect(daysSince("2026-11-12T11:00:00Z", now)).toBe(1);
    expect(daysSince(new Date("2026-10-14T12:00:00Z"), now)).toBe(30);
  });
  it("clamps future and invalid dates to 0", () => {
    expect(daysSince("2026-12-01T00:00:00Z", now)).toBe(0);
    expect(daysSince("not a date", now)).toBe(0);
  });
});

describe("ageInWords", () => {
  it("writes ages in days, months and years", () => {
    expect(ageInWords(0)).toBe("Today");
    expect(ageInWords(1)).toBe("1 day");
    expect(ageInWords(17)).toBe("17 days");
    expect(ageInWords(30)).toBe("1 month");
    expect(ageInWords(125)).toBe("4 months");
    expect(ageInWords(400)).toBe("1 year");
    expect(ageInWords(800)).toBe("2 years");
  });
});

describe("agoInWords / plural", () => {
  it("writes an age for the middle of a sentence", () => {
    expect(agoInWords(0)).toBe("today");
    expect(agoInWords(17)).toBe("17 days ago");
    expect(agoInWords(125)).toBe("4 months ago");
  });
  it("pluralises with an optional irregular form", () => {
    expect(plural(1, "lead")).toBe("1 lead");
    expect(plural(3, "lead")).toBe("3 leads");
    expect(plural(2, "person", "people")).toBe("2 people");
  });
});

describe("parseAmount", () => {
  it("reads grouped or prefixed rupee input, else 0", () => {
    expect(parseAmount("1,10,000")).toBe(110000);
    expect(parseAmount("₹ 6200.5")).toBe(6200.5);
    expect(parseAmount("abc")).toBe(0);
  });
});

describe("relativeTime", () => {
  afterEach(() => vi.useRealTimers());

  function at(msAgo: number) {
    return new Date(Date.now() - msAgo);
  }

  it("handles each bucket", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(relativeTime(at(0))).toBe("just now");
    expect(relativeTime(at(5 * 60000))).toBe("5m ago");
    expect(relativeTime(at(3 * 3600000))).toBe("3h ago");
    expect(relativeTime(at(2 * 86400000))).toBe("2d ago");
    expect(relativeTime(at(60 * 86400000))).toBe("2mo ago");
    expect(relativeTime(at(400 * 86400000))).toBe("1y ago");
  });
  it("accepts an ISO string", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(relativeTime(new Date(Date.now() - 5 * 60000).toISOString())).toBe("5m ago");
  });
});
