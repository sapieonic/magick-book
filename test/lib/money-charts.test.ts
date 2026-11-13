import { describe, it, expect } from "vitest";
import {
  buildCollectedByMonth,
  groupLedger,
  invoiceAge,
  matchesInvoiceQuery,
  matchesLedgerFilter,
  monthLabel,
  utcMonthKey,
} from "@/lib/money-charts";
import type { InvoiceDTO } from "@/lib/types";

function inv(over: Partial<InvoiceDTO> & Pick<InvoiceDTO, "id" | "amount" | "status">): InvoiceDTO {
  return {
    number: 1000,
    accountId: "a1",
    accountName: "Acme",
    issuedAt: "2026-01-15T00:00:00.000Z",
    dueAt: null,
    paidAt: null,
    hasFile: false,
    fileName: null,
    ...over,
  };
}

const now = new Date("2026-08-15T12:00:00.000Z");

describe("UTC helpers", () => {
  it("utcMonthKey uses the UTC calendar month near day boundaries", () => {
    // 2026-07-31 22:00 UTC is still July UTC; local IST would already be Aug 1.
    expect(utcMonthKey(new Date("2026-07-31T22:00:00.000Z"))).toBe("2026-07");
    expect(utcMonthKey(new Date("2026-08-01T00:30:00.000Z"))).toBe("2026-08");
  });

  it("monthLabel gives short and long names", () => {
    expect(monthLabel("2026-06")).toBe("Jun");
    expect(monthLabel("2026-11", true)).toBe("November");
  });
});

describe("invoiceAge", () => {
  it("describes open invoices relative to their due date", () => {
    expect(invoiceAge(inv({ id: "1", amount: 1, status: "overdue", dueAt: "2026-08-01T00:00:00.000Z" }), now)).toEqual({ text: "14 days overdue", late: true });
    expect(invoiceAge(inv({ id: "1", amount: 1, status: "sent", dueAt: "2026-08-14T00:00:00.000Z" }), now)).toEqual({ text: "1 day overdue", late: true });
    expect(invoiceAge(inv({ id: "1", amount: 1, status: "sent", dueAt: "2026-08-15T00:00:00.000Z" }), now)).toEqual({ text: "Due today", late: false });
    expect(invoiceAge(inv({ id: "1", amount: 1, status: "sent", dueAt: "2026-08-20T00:00:00.000Z" }), now)).toEqual({ text: "Due in 5 days", late: false });
  });

  it("calls an invoice marked overdue before its due date just overdue", () => {
    expect(invoiceAge(inv({ id: "1", amount: 1, status: "overdue", dueAt: "2026-08-20T00:00:00.000Z" }), now)).toEqual({ text: "Overdue", late: true });
  });

  it("describes paid invoices by how long they took", () => {
    const paid = inv({ id: "1", amount: 1, status: "paid", issuedAt: "2026-07-01T00:00:00.000Z", paidAt: "2026-07-09T00:00:00.000Z" });
    expect(invoiceAge(paid, now).text).toBe("8 days to pay");
    expect(invoiceAge({ ...paid, paidAt: paid.issuedAt }, now).text).toBe("Paid same day");
  });

  it("marks drafts as not issued", () => {
    expect(invoiceAge(inv({ id: "1", amount: 1, status: "draft" }), now).text).toBe("Not issued");
  });
});

describe("buildCollectedByMonth", () => {
  const paid = (id: string, amount: number, accountId: string, paidAt: string) =>
    inv({ id, amount, status: "paid", accountId, accountName: accountId.toUpperCase(), paidAt });

  it("returns the last N UTC months, oldest first, zero-filled", () => {
    const c = buildCollectedByMonth([], now, { months: 6 });
    expect(c.months.map((m) => m.key)).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(c.months.every((m) => m.total === 0 && m.amounts.length === 0)).toBe(true);
    expect(c.series).toEqual([]);
    expect(c.total).toBe(0);
  });

  it("stacks the top two accounts plus Other, keyed by account id", () => {
    const c = buildCollectedByMonth(
      [
        paid("1", 100, "acme", "2026-07-10T00:00:00.000Z"),
        paid("2", 50, "acme", "2026-08-05T00:00:00.000Z"),
        paid("3", 80, "lumen", "2026-07-20T00:00:00.000Z"),
        paid("4", 30, "pine", "2026-08-02T00:00:00.000Z"),
        paid("5", 20, "oak", "2026-07-02T00:00:00.000Z"),
        paid("6", 999, "acme", "2026-01-01T00:00:00.000Z"), // outside the window
        inv({ id: "7", amount: 777, status: "sent", accountId: "acme" }),
      ],
      now,
      { months: 3 },
    );
    expect(c.series).toEqual([
      { key: "acme", name: "ACME", total: 150 },
      { key: "lumen", name: "LUMEN", total: 80 },
      { key: "other", name: "Other accounts", total: 50 },
    ]);
    const [jun, jul, aug] = c.months;
    expect(jun).toEqual({ key: "2026-06", total: 0, amounts: [0, 0, 0] });
    expect(jul).toEqual({ key: "2026-07", total: 200, amounts: [100, 80, 20] });
    expect(aug).toEqual({ key: "2026-08", total: 80, amounts: [50, 0, 30] });
    expect(c.total).toBe(280);
  });

  it("omits Other when two or fewer accounts paid", () => {
    const c = buildCollectedByMonth([paid("1", 10, "acme", "2026-08-01T00:00:00.000Z")], now);
    expect(c.series.map((s) => s.key)).toEqual(["acme"]);
  });

  it("keeps late-UTC-day payments in the UTC month", () => {
    const c = buildCollectedByMonth([paid("1", 1000, "acme", "2026-07-31T22:00:00.000Z")], now, { months: 2 });
    expect(c.months.map((m) => m.total)).toEqual([1000, 0]);
  });
});

describe("ledger helpers", () => {
  const rows = [
    inv({ id: "p1", number: 1001, amount: 1, status: "paid", paidAt: "2026-07-01T00:00:00.000Z" }),
    inv({ id: "p2", number: 1002, amount: 1, status: "paid", paidAt: "2026-08-01T00:00:00.000Z" }),
    inv({ id: "o1", number: 1003, amount: 5, status: "sent", dueAt: "2026-08-10T00:00:00.000Z", accountName: "Lumen Labs" }),
    inv({ id: "o2", number: 1023, amount: 9, status: "overdue", dueAt: "2026-05-01T00:00:00.000Z" }),
    inv({ id: "o3", number: 1005, amount: 7, status: "sent", dueAt: "2026-09-01T00:00:00.000Z" }),
    inv({ id: "d1", number: 1006, amount: 3, status: "draft" }),
  ];

  it("groups outstanding (most overdue first), paid (latest first) and drafts", () => {
    const g = groupLedger(rows, now);
    expect(g.outstanding.map((i) => i.id)).toEqual(["o2", "o1", "o3"]);
    expect(g.paid.map((i) => i.id)).toEqual(["p2", "p1"]);
    expect(g.draft.map((i) => i.id)).toEqual(["d1"]);
  });

  it("filters by equation side or aging band", () => {
    const ids = (f: Parameters<typeof matchesLedgerFilter>[1]) => rows.filter((r) => matchesLedgerFilter(r, f, now)).map((r) => r.id);
    expect(ids("all")).toHaveLength(rows.length);
    expect(ids("paid")).toEqual(["p1", "p2"]);
    expect(ids("outstanding")).toEqual(["o1", "o2", "o3"]);
    expect(ids("d30")).toEqual(["o1"]);
    expect(ids("d60plus")).toEqual(["o2"]);
    expect(ids("current")).toEqual(["o3"]);
  });

  it("searches by invoice number (with or without #) and account name", () => {
    const hits = (q: string) => rows.filter((r) => matchesInvoiceQuery(r, q)).map((r) => r.id);
    expect(hits("#1023")).toEqual(["o2"]);
    expect(hits("lumen")).toEqual(["o1"]);
    expect(hits("  ")).toHaveLength(rows.length);
  });
});
