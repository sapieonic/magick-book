import { describe, it, expect } from "vitest";
import {
  agingDate,
  agingKey,
  collections,
  daysPastDue,
  isOutstanding,
  outstandingAging,
  paidOn,
  rankDebtors,
  type ReceivableInvoice,
} from "@/lib/receivables";

const now = new Date(2026, 10, 13, 15, 0); // Fri 13 Nov 2026, 3pm local
const day = (y: number, m: number, d: number) => new Date(y, m, d, 10, 0);

let seq = 1000;
function inv(p: Partial<ReceivableInvoice>): ReceivableInvoice {
  return { accountId: "a1", number: ++seq, amount: 100, status: "sent", issuedAt: day(2026, 10, 1), ...p };
}

describe("isOutstanding", () => {
  it("counts sent and overdue only", () => {
    expect(isOutstanding("sent")).toBe(true);
    expect(isOutstanding("overdue")).toBe(true);
    expect(isOutstanding("paid")).toBe(false);
    expect(isOutstanding("draft")).toBe(false);
  });
});

describe("aging", () => {
  it("ages from the due date, falling back to the issue date", () => {
    const due = day(2026, 10, 20);
    expect(agingDate({ issuedAt: day(2026, 10, 1), dueAt: due })).toBe(due);
    expect(agingDate({ issuedAt: day(2026, 10, 1), dueAt: null })).toEqual(day(2026, 10, 1));
  });

  it("counts whole calendar days past due", () => {
    expect(daysPastDue({ issuedAt: now, dueAt: day(2026, 10, 13) }, now)).toBe(0);
    expect(daysPastDue({ issuedAt: now, dueAt: day(2026, 10, 12) }, now)).toBe(1);
    expect(daysPastDue({ issuedAt: now, dueAt: day(2026, 10, 20) }, now)).toBe(-7);
  });

  it("buckets at the 0 / 30 / 60 day edges", () => {
    expect(agingKey(-3)).toBe("current");
    expect(agingKey(0)).toBe("current");
    expect(agingKey(1)).toBe("d1_30");
    expect(agingKey(30)).toBe("d1_30");
    expect(agingKey(31)).toBe("d31_60");
    expect(agingKey(60)).toBe("d31_60");
    expect(agingKey(61)).toBe("d60plus");
  });

  it("sums outstanding invoices into buckets and ignores paid and draft", () => {
    const aging = outstandingAging(
      [
        inv({ amount: 1020, dueAt: day(2026, 10, 30) }), // not yet due
        inv({ amount: 5000, status: "overdue", dueAt: day(2026, 10, 7) }), // 6 days
        inv({ amount: 300, dueAt: null, issuedAt: day(2026, 9, 1) }), // no due date: 43 days from issue
        inv({ amount: 18880, status: "overdue", dueAt: day(2026, 8, 4) }), // 70 days
        inv({ amount: 999, status: "paid", dueAt: day(2026, 1, 1) }),
        inv({ amount: 777, status: "draft", dueAt: day(2026, 1, 1) }),
      ],
      now,
    );
    expect(aging).toEqual({ current: 1020, d1_30: 5000, d31_60: 300, d60plus: 18880 });
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
  it("uses paidAt, falling back to the issue date for legacy paid rows", () => {
    expect(paidOn(inv({ status: "paid", paidAt: day(2026, 10, 2) }))).toEqual(day(2026, 10, 2));
    expect(paidOn(inv({ status: "paid", paidAt: null, issuedAt: day(2026, 9, 9) }))).toEqual(day(2026, 9, 9));
    expect(paidOn(inv({ status: "sent" }))).toBeNull();
  });

  it("totals this month and last month by payment date, latest payment first", () => {
    const early = inv({ status: "paid", amount: 840, paidAt: day(2026, 10, 2), number: 1017 });
    const late = inv({ status: "paid", amount: 1000, paidAt: day(2026, 10, 10), number: 1018 });
    const c = collections(
      [
        early,
        late,
        inv({ status: "paid", amount: 590000, paidAt: day(2026, 9, 20) }), // October
        inv({ status: "paid", amount: 5, paidAt: day(2026, 8, 30) }), // September: neither
        inv({ status: "sent", amount: 123 }),
      ],
      now,
    );
    expect(c.thisMonth).toBe(1840);
    expect(c.lastMonth).toBe(590000);
    expect(c.payments.map((p) => p.number)).toEqual([1018, 1017]);
  });

  it("rolls the previous month over the year boundary", () => {
    const january = new Date(2027, 0, 5);
    const c = collections([inv({ status: "paid", amount: 70, paidAt: new Date(2026, 11, 28) })], january);
    expect(c).toMatchObject({ thisMonth: 0, lastMonth: 70 });
  });
});
