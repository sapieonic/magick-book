import { describe, it, expect, vi, afterEach } from "vitest";
import { formatINR, formatINRCompact, initials, avatarTint, relativeTime } from "@/lib/utils";

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

describe("avatarTint", () => {
  it("is deterministic for the same seed", () => {
    expect(avatarTint("Priya")).toEqual(avatarTint("Priya"));
  });
  it("returns a bg/fg pair", () => {
    const t = avatarTint("anyone");
    expect(t.bg).toMatch(/^#/);
    expect(t.fg).toMatch(/^#/);
  });
  it("can differ across seeds", () => {
    const seeds = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const distinct = new Set(seeds.map((s) => avatarTint(s).bg));
    expect(distinct.size).toBeGreaterThan(1);
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
