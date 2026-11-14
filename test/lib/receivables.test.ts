import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  agingDate,
  agingKey,
  buildOutstandingAging,
  collections,
  daysPastDue,
  displayStatus,
  isOutstanding,
  isOverdue,
  paymentDate,
  rankDebtors,
  rollupMoney,
  type InvoiceLike,
} from "@/lib/receivables";

const now = new Date("2026-08-15T12:00:00.000Z"); // 17:30 IST, 15 Aug
const utc = (d: string) => `${d}T00:00:00.000Z`;
/** An IST wall-clock time ("2026-08-15T02:00") as an instant. */
const ist = (wall: string) => new Date(`${wall}:00.000+05:30`);

type Row = InvoiceLike & { accountId: string; accountName?: string; number: number };
let seq = 1000;
function inv(p: Partial<Row>): Row {
  return { accountId: "a1", number: ++seq, amount: 100, status: "sent", issuedAt: utc("2026-01-15"), dueAt: null, paidAt: null, ...p };
}

describe("isOutstanding", () => {
  it("counts sent and overdue only", () => {
    expect(["sent", "overdue", "paid", "draft"].map((status) => isOutstanding(inv({ status: status as Row["status"] })))).toEqual([true, true, false, false]);
  });
});

describe("dates", () => {
  it("ages from the due date, falling back to the issue date", () => {
    expect(agingDate({ issuedAt: utc("2026-08-01"), dueAt: utc("2026-08-20") }).toISOString()).toBe(utc("2026-08-20"));
    expect(agingDate({ issuedAt: utc("2026-08-01"), dueAt: null }).toISOString()).toBe(utc("2026-08-01"));
  });

  it("counts whole calendar days", () => {
    expect(daysPastDue({ issuedAt: now, dueAt: utc("2026-08-15") }, now)).toBe(0);
    expect(daysPastDue({ issuedAt: now, dueAt: utc("2026-08-14") }, now)).toBe(1);
    expect(daysPastDue({ issuedAt: now, dueAt: new Date(utc("2026-08-22")) }, now)).toBe(-7);
  });

  it("dates a payment by paidAt, else the issue date for legacy paid rows", () => {
    expect(paymentDate(inv({ status: "paid", paidAt: utc("2026-03-10"), issuedAt: utc("2026-02-01") }))?.toISOString()).toBe(utc("2026-03-10"));
    expect(paymentDate(inv({ status: "paid", issuedAt: utc("2026-02-01") }))?.toISOString()).toBe(utc("2026-02-01"));
    expect(paymentDate(inv({ status: "sent" }))).toBeNull();
  });
});

describe("aging and overdue", () => {
  const rows = [
    inv({ amount: 10, dueAt: utc("2026-08-20"), accountName: "Lumen" }), // not yet due
    inv({ amount: 20, status: "overdue", dueAt: utc("2026-08-01"), accountName: "Acme" }), // 14d
    inv({ amount: 70, dueAt: utc("2026-08-14"), accountName: "Pine" }), // 1d, still "sent"
    inv({ amount: 30, status: "overdue", dueAt: utc("2026-07-01") }), // 45d
    inv({ amount: 40, status: "overdue", dueAt: utc("2026-05-01") }), // 106d
    inv({ amount: 99, status: "paid", dueAt: utc("2026-05-01") }),
    inv({ amount: 99, status: "draft" }),
  ];

  it("bands outstanding invoices at the 0 / 30 / 60 day edges", () => {
    expect(rows.map((r) => agingKey(r, now))).toEqual(["current", "d30", "d30", "d60", "d60plus", null, null]);
    expect(agingKey(inv({ dueAt: "2026-08-15T23:00:00.000Z" }), now)).toBe("current");
    expect(agingKey(inv({ dueAt: utc("2026-07-16") }), now)).toBe("d30");
    expect(agingKey(inv({ dueAt: utc("2026-07-15") }), now)).toBe("d60");
  });

  it("falls back to the issue date when there is no due date", () => {
    expect(agingKey(inv({ issuedAt: utc("2026-06-01") }), now)).toBe("d60plus");
  });

  it("treats an invoice marked overdue before its date as 1–30 days", () => {
    const early = inv({ status: "overdue", dueAt: utc("2026-08-20") });
    expect(agingKey(early, now)).toBe("d30");
    expect(isOverdue(early, now)).toBe(true);
  });

  it("calls an invoice overdue exactly when it is outside the current band", () => {
    expect(rows.map((r) => isOverdue(r, now))).toEqual([false, true, true, true, true, false, false]);
    expect(rows.map((r) => displayStatus(r, now))).toEqual(["sent", "overdue", "overdue", "overdue", "overdue", "paid", "draft"]);
  });

  it("sums amount, count and the owing accounts (largest first) per band", () => {
    const aging = buildOutstandingAging(rows, now);
    expect(aging.map((b) => b.key)).toEqual(["current", "d30", "d60", "d60plus"]);
    expect(aging[0]).toEqual({ key: "current", amount: 10, count: 1, accounts: ["Lumen"] });
    expect(aging[1]).toEqual({ key: "d30", amount: 90, count: 2, accounts: ["Pine", "Acme"] });
    expect(aging[2]).toMatchObject({ amount: 30, count: 1 });
    expect(aging[3]).toMatchObject({ amount: 40, count: 1 });
  });
});

describe("rollupMoney", () => {
  const invoices = [
    inv({ amount: 1000, status: "paid" }),
    inv({ amount: 500, dueAt: utc("2026-09-01") }),
    inv({ amount: 250, dueAt: utc("2026-08-01") }),
    inv({ amount: 9999, status: "draft" }),
  ];

  it("sums the equation, the overdue part and counts, excluding drafts", () => {
    const t = rollupMoney(invoices, [{ amount: 350 }], now);
    expect(t).toMatchObject({
      billed: 1750, billedCount: 3,
      paid: 1000, paidCount: 1,
      outstanding: 750, outstandingCount: 2,
      overdue: 250, overdueCount: 1,
      expenses: 350,
    });
    expect(t.margin).toBeCloseTo(0.8);
  });

  it("reports a negative margin when expenses outrun billing, and zero when nothing is billed", () => {
    expect(rollupMoney(invoices, [{ amount: 3500 }], now).margin).toBeCloseTo(-1);
    expect(rollupMoney([], [{ amount: 10 }], now).margin).toBe(0);
    expect(rollupMoney([inv({ status: "draft", amount: 500 })], [{ amount: 10 }], now).margin).toBe(0);
  });
});

describe("rankDebtors", () => {
  it("groups outstanding by account, largest first, with invoice counts", () => {
    const ranked = rankDebtors([
      inv({ accountId: "small", amount: 50 }),
      inv({ accountId: "big", amount: 700 }),
      inv({ accountId: "big", amount: 300, status: "overdue" }),
      inv({ accountId: "paid-up", amount: 9999, status: "paid" }),
    ]);
    expect(ranked).toEqual([
      { accountId: "big", amount: 1000, invoices: 2 },
      { accountId: "small", amount: 50, invoices: 1 },
    ]);
  });
});

describe("collections", () => {
  it("totals this month and last by payment date, latest payment first", () => {
    const early = inv({ status: "paid", amount: 840, paidAt: utc("2026-08-02"), number: 1017 });
    const late = inv({ status: "paid", amount: 1000, paidAt: utc("2026-08-10"), number: 1018 });
    const c = collections(
      [
        early,
        late,
        inv({ status: "paid", amount: 590000, paidAt: ist("2026-07-31T23:30") }), // July
        inv({ status: "paid", amount: 5, paidAt: utc("2026-06-30") }), // June: neither
        inv({ status: "sent", amount: 123 }),
      ],
      now,
    );
    expect(c.thisMonth).toBe(1840);
    expect(c.lastMonth).toBe(590000);
    expect(c.payments.map((p) => p.number)).toEqual([1018, 1017]);
  });

  it("rolls the previous month over the year boundary", () => {
    const c = collections([inv({ status: "paid", amount: 70, paidAt: utc("2026-12-28") })], new Date(utc("2027-01-05")));
    expect(c).toMatchObject({ thisMonth: 0, lastMonth: 70 });
  });
});

/**
 * Days and months are IST calendar days and months, whatever the host's zone:
 * the 00:00–05:30 IST window is the previous UTC day, which is where UTC maths
 * went wrong. Run under UTC (servers) and a negative-offset zone.
 */
describe.each(["UTC", "America/Los_Angeles"])("IST business days with TZ=%s", (tz) => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = tz;
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  it("runs in the requested host zone", () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(tz === "UTC" ? 0 : 480);
  });

  it("is not overdue until the IST due date is over", () => {
    // Created 02:00 IST on 13 Nov (20:30 UTC on the 12th), due 14 days later: 27 Nov IST.
    const created = ist("2026-11-13T02:00");
    const invoice = inv({ issuedAt: created, dueAt: new Date(created.getTime() + 14 * 86_400_000) });
    expect(daysPastDue(invoice, ist("2026-11-27T10:00"))).toBe(0);
    expect(isOverdue(invoice, ist("2026-11-27T10:00"))).toBe(false);
    expect(isOverdue(invoice, ist("2026-11-27T23:59"))).toBe(false);
    expect(daysPastDue(invoice, ist("2026-11-28T00:01"))).toBe(1);
    expect(isOverdue(invoice, ist("2026-11-28T00:01"))).toBe(true);
  });

  it("puts the 00:00–05:30 IST window on the IST day, not the UTC one", () => {
    const due = ist("2026-08-14T03:00"); // 21:30 UTC on 13 Aug
    expect(daysPastDue({ issuedAt: due, dueAt: due }, ist("2026-08-14T23:00"))).toBe(0); // 17:30 UTC, still the 14th
    expect(daysPastDue({ issuedAt: due, dueAt: due }, ist("2026-08-15T05:00"))).toBe(1); // 23:30 UTC on the 14th
    expect(agingKey(inv({ dueAt: due }), ist("2026-08-15T05:00"))).toBe("d30");
    expect(agingKey(inv({ dueAt: ist("2026-07-16T01:00") }), ist("2026-08-15T05:00"))).toBe("d30"); // 30 days
    expect(agingKey(inv({ dueAt: ist("2026-07-15T23:00") }), ist("2026-08-15T05:00"))).toBe("d60"); // 31 days
  });

  it("counts a payment at 03:00 IST on the 1st in that month", () => {
    const c = collections(
      [
        inv({ status: "paid", amount: 300, paidAt: ist("2026-11-01T03:00") }), // 21:30 UTC on 31 Oct
        inv({ status: "paid", amount: 20, paidAt: ist("2026-10-31T23:59") }),
        inv({ status: "paid", amount: 1, paidAt: ist("2026-09-30T23:59") }),
      ],
      ist("2026-11-13T09:00"),
    );
    expect(c).toMatchObject({ thisMonth: 300, lastMonth: 20 });
  });

  it("starts the month at 00:00 IST on the 1st, even when it is still the 31st in UTC", () => {
    const c = collections([inv({ status: "paid", amount: 50, paidAt: ist("2026-11-01T00:00") })], ist("2026-11-01T00:30"));
    expect(c).toMatchObject({ thisMonth: 50, lastMonth: 0 });
  });
});
