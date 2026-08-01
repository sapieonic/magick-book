import { describe, it, expect } from "vitest";
import {
  buildPaidByAccountMoM,
  buildOutstandingAging,
  paymentDate,
  utcMonthKey,
  differenceInUtcCalendarDays,
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

describe("paymentDate", () => {
  it("prefers paidAt over issuedAt", () => {
    const d = paymentDate(
      inv({
        id: "1",
        amount: 1,
        status: "paid",
        paidAt: "2026-03-10T00:00:00.000Z",
        issuedAt: "2026-02-01T00:00:00.000Z",
      }),
    );
    expect(d?.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  it("falls back to issuedAt for legacy paid rows", () => {
    const d = paymentDate(
      inv({ id: "1", amount: 1, status: "paid", paidAt: null, issuedAt: "2026-02-01T00:00:00.000Z" }),
    );
    expect(d?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("returns null for non-paid", () => {
    expect(paymentDate(inv({ id: "1", amount: 1, status: "sent" }))).toBeNull();
  });
});

describe("UTC helpers", () => {
  it("utcMonthKey uses the UTC calendar month near day boundaries", () => {
    // 2026-07-31 22:00 UTC is still July UTC; local IST would already be Aug 1.
    expect(utcMonthKey(new Date("2026-07-31T22:00:00.000Z"))).toBe("2026-07");
    expect(utcMonthKey(new Date("2026-08-01T00:30:00.000Z"))).toBe("2026-08");
  });

  it("differenceInUtcCalendarDays ignores local timezone offsets", () => {
    const now = new Date("2026-08-15T01:00:00.000Z");
    const due = new Date("2026-08-14T23:00:00.000Z");
    expect(differenceInUtcCalendarDays(now, due)).toBe(1);
  });
});

describe("buildPaidByAccountMoM", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");

  it("stacks paid amounts by account across UTC months", () => {
    const series = buildPaidByAccountMoM(
      [
        inv({
          id: "1",
          amount: 100000,
          status: "paid",
          accountName: "Acme",
          paidAt: "2026-07-10T00:00:00.000Z",
        }),
        inv({
          id: "2",
          amount: 40000,
          status: "paid",
          accountName: "Lumen",
          paidAt: "2026-07-20T00:00:00.000Z",
        }),
        inv({
          id: "3",
          amount: 50000,
          status: "paid",
          accountName: "Acme",
          paidAt: "2026-08-05T00:00:00.000Z",
        }),
        inv({ id: "4", amount: 999, status: "sent", accountName: "Acme" }),
      ],
      { now, months: 3 },
    );

    expect(series.accounts.map((a) => a.name)).toEqual(["Acme", "Lumen"]);
    expect(series.accounts.map((a) => a.key)).toEqual(["acct:Acme", "acct:Lumen"]);
    expect(series.totalPaid).toBe(190000);
    const jul = series.months.find((m) => m.key === "2026-07")!;
    const aug = series.months.find((m) => m.key === "2026-08")!;
    expect(jul["acct:Acme"]).toBe(100000);
    expect(jul["acct:Lumen"]).toBe(40000);
    expect(aug["acct:Acme"]).toBe(50000);
    expect(aug["acct:Lumen"]).toBe(0);
  });

  it("keeps late-UTC-day payments in the UTC month (not the viewer's local month)", () => {
    const series = buildPaidByAccountMoM(
      [
        inv({
          id: "1",
          amount: 1000,
          status: "paid",
          accountName: "Acme",
          // 31 Jul 22:00 UTC — would be 1 Aug in IST (UTC+5:30)
          paidAt: "2026-07-31T22:00:00.000Z",
        }),
      ],
      { now: new Date("2026-08-15T12:00:00.000Z"), months: 3 },
    );
    const jul = series.months.find((m) => m.key === "2026-07")!;
    const aug = series.months.find((m) => m.key === "2026-08")!;
    expect(jul["acct:Acme"]).toBe(1000);
    expect(aug["acct:Acme"]).toBe(0);
  });

  it("rolls lower-ranked accounts into Other without colliding reserved keys", () => {
    const invoices = [
      ...Array.from({ length: 7 }, (_, i) =>
        inv({
          id: String(i),
          amount: 1000 * (7 - i),
          status: "paid",
          accountName: `Acct ${i}`,
          paidAt: "2026-08-01T00:00:00.000Z",
        }),
      ),
      // Reserved-looking names must not overwrite month/key or merge into Other incorrectly.
      inv({
        id: "month",
        amount: 50,
        status: "paid",
        accountName: "month",
        paidAt: "2026-08-01T00:00:00.000Z",
      }),
      inv({
        id: "other",
        amount: 25,
        status: "paid",
        accountName: "Other",
        paidAt: "2026-08-01T00:00:00.000Z",
      }),
    ];
    const series = buildPaidByAccountMoM(invoices, { now, months: 1, topN: 3 });
    expect(series.accounts.map((a) => a.name)).toEqual(["Acct 0", "Acct 1", "Acct 2", "Other accounts"]);
    expect(series.accounts.map((a) => a.key)).toEqual(["acct:Acct 0", "acct:Acct 1", "acct:Acct 2", "__other__"]);
    const row = series.months[0]!;
    expect(row.month).toBe("Aug");
    expect(row.key).toBe("2026-08");
    // Top 3 + remainder (Acct 3–6 + literal "month" + literal "Other")
    expect(row.__other__).toBe(1000 + 2000 + 3000 + 4000 + 50 + 25);
  });
});

describe("buildOutstandingAging", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");

  it("buckets by UTC days past due", () => {
    const rows = buildOutstandingAging(
      [
        inv({ id: "1", amount: 10, status: "sent", dueAt: "2026-08-20T00:00:00.000Z" }), // current
        inv({ id: "2", amount: 20, status: "overdue", dueAt: "2026-08-01T00:00:00.000Z" }), // 14d → 1–30
        inv({ id: "3", amount: 30, status: "overdue", dueAt: "2026-07-01T00:00:00.000Z" }), // 45d → 31–60
        inv({ id: "4", amount: 40, status: "overdue", dueAt: "2026-05-01T00:00:00.000Z" }), // 106d → 60+
        inv({ id: "5", amount: 99, status: "paid", dueAt: "2026-05-01T00:00:00.000Z" }),
      ],
      { now },
    );

    expect(rows.find((r) => r.bucket === "Current")).toMatchObject({ amount: 10, count: 1 });
    expect(rows.find((r) => r.bucket === "1–30 days")).toMatchObject({ amount: 20, count: 1 });
    expect(rows.find((r) => r.bucket === "31–60 days")).toMatchObject({ amount: 30, count: 1 });
    expect(rows.find((r) => r.bucket === "60+ days")).toMatchObject({ amount: 40, count: 1 });
  });
});
