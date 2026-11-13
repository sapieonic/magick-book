// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildCollectedByMonth } from "@/lib/money-charts";
import { buildOutstandingAging, rollupMoney } from "@/lib/receivables";
import type { ExpenseDTO, InvoiceDTO, MoneySummary } from "@/lib/types";

const H = vi.hoisted(() => ({
  data: null as unknown,
  refresh: vi.fn(),
  patch: vi.fn(async () => ({})),
}));

vi.mock("@/lib/client", () => ({
  useApi: () => ({ data: H.data, setData: vi.fn(), error: null, loading: false, refresh: H.refresh }),
  api: { get: vi.fn(), post: vi.fn(), patch: H.patch, put: vi.fn(), delete: vi.fn() },
}));

import MoneyPage from "@/app/(app)/money/page";
import { ToastProvider } from "@/components/ui/Toast";

const NOW = new Date("2026-11-13T09:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function inv(over: Partial<InvoiceDTO> & Pick<InvoiceDTO, "id" | "number" | "amount" | "status">): InvoiceDTO {
  return { accountId: "acme", accountName: "Acme", issuedAt: day(20), dueAt: null, paidAt: null, hasFile: false, fileName: null, ...over };
}

function summary(invoices: InvoiceDTO[], expenses: ExpenseDTO[] = []): MoneySummary {
  return {
    asOf: NOW.toISOString(),
    invoices,
    expenses,
    totals: rollupMoney(invoices, expenses, NOW),
    aging: buildOutstandingAging(invoices, NOW),
    collected: buildCollectedByMonth(invoices, NOW),
  };
}

const INVOICES = [
  inv({ id: "cur", number: 1024, amount: 1020, status: "sent", dueAt: day(-5) }),
  inv({ id: "late", number: 1016, amount: 18880, status: "overdue", dueAt: day(70), accountId: "artha", accountName: "Artha" }),
  inv({ id: "paid", number: 1018, amount: 1840, status: "paid", paidAt: day(10), hasFile: true, fileName: "1018.pdf" }),
];

const renderPage = () => render(<ToastProvider><MoneyPage /></ToastProvider>);
const ledgerNumbers = () =>
  within(screen.getByRole("region", { name: "Ledger" }))
    .queryAllByText(/^#\d+$/)
    .map((el) => el.textContent);

beforeEach(() => {
  H.data = summary(INVOICES);
  H.refresh.mockClear();
  H.patch.mockClear();
});

describe("Money page", () => {
  it("shows the receivables equation and does not celebrate margin without expenses", () => {
    renderPage();
    const equation = screen.getByRole("region", { name: "Receivables equation" });
    expect(within(equation).getByRole("button", { name: /Billed/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(equation).getByRole("button", { name: /Outstanding.*2 invoices, 1 overdue/ })).toBeInTheDocument();
    expect(within(equation).getByText("No expenses recorded")).toBeInTheDocument();
    expect(within(equation).queryByText(/100%/)).toBeNull();
  });

  it("groups the ledger outstanding first, then paid, with a download link for stored files", () => {
    renderPage();
    expect(ledgerNumbers()).toEqual(["#1016", "#1024", "#1018"]);
    expect(screen.getAllByText("Outstanding · 2 invoices")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Total billed · 3 invoices")[0]).toBeInTheDocument();
    // One link in the File column, one in the actions cell for phones (CSS shows only one).
    for (const link of screen.getAllByRole("link", { name: "Download, invoice #1018 file" })) {
      expect(link).toHaveAttribute("href", "/api/invoices/paid/document");
    }
  });

  it("filters the ledger by aging band and resets", async () => {
    const user = userEvent.setup();
    renderPage();
    const band = screen.getByRole("button", { name: /^60\+ days/ });
    await user.click(band);
    expect(band).toHaveAttribute("aria-pressed", "true");
    expect(ledgerNumbers()).toEqual(["#1016"]);
    expect(screen.getByRole("button", { name: /^31–60 days/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Show all ages" }));
    expect(band).toHaveAttribute("aria-pressed", "false");
    expect(ledgerNumbers()).toHaveLength(3);
  });

  it("narrows to paid from the equation and clears via the filter chip", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /^Paid/ }));
    expect(ledgerNumbers()).toEqual(["#1018"]);
    await user.click(screen.getByRole("button", { name: "Clear filter, show all invoices" }));
    expect(ledgerNumbers()).toHaveLength(3);
  });

  it("marks an invoice paid inline and refreshes", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Mark paid, invoice #1016" }));
    expect(H.patch).toHaveBeenCalledWith("/api/invoices/late", { status: "paid" });
    expect(H.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Mark paid, invoice #1018" })).toBeNull();
  });

  it("switches to the expenses ledger and shows margin once costs exist", async () => {
    const user = userEvent.setup();
    H.data = summary(INVOICES, [
      { id: "e1", accountId: "acme", accountName: "Acme", date: day(3), category: "Software", vendor: "Figma", amount: 2000, billable: true },
    ]);
    renderPage();
    expect(screen.getByText(/% ·/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Expenses/ }));
    expect(screen.getByText("Figma")).toBeInTheDocument();
    expect(screen.getByText("Total · 1 expense")).toBeInTheDocument();
  });
});
