// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AccountListItem, ExpenseDTO, InvoiceDTO } from "@/lib/types";
import { buildStatement, overdueLabel } from "@/components/accounts/statement";
import { StatementBar } from "@/components/accounts/AccountHeader";

const H = vi.hoisted(() => ({ accounts: [] as unknown[], push: vi.fn(), detail: {} as Record<string, unknown> }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/accounts",
}));

vi.mock("@/components/layout/SessionContext", () => ({ useSession: () => ({ id: "u1", name: "Riya", role: "admin" }) }));

vi.mock("@/lib/client", () => ({
  useApi: (url: string) => ({
    data: url.startsWith("/api/accounts?") || url === "/api/accounts"
      ? { accounts: H.accounts, tabCounts: { all: H.accounts.length, active: H.accounts.length, at_risk: 0, churned: 0, archived: 0 } }
      : H.detail[url.replace(/\?.*$/, "")],
    setData: vi.fn(),
    error: null,
    loading: false,
    refresh: vi.fn(async () => {}),
  }),
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const DAY = 86400000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

function invoice(over: Partial<InvoiceDTO>): InvoiceDTO {
  return { id: "i", number: 1, accountId: "a", issuedAt: iso(30), dueAt: null, paidAt: null, amount: 0, status: "sent", hasFile: false, fileName: null, ...over };
}
function expense(over: Partial<ExpenseDTO>): ExpenseDTO {
  return { id: "e", accountId: "a", date: iso(5), category: "Travel", vendor: "", amount: 0, billable: false, ...over };
}

describe("buildStatement", () => {
  const invoices = [
    invoice({ id: "1", number: 1001, issuedAt: iso(60), amount: 1000, status: "paid", paidAt: iso(40) }),
    invoice({ id: "2", number: 1002, issuedAt: iso(20), amount: 500, status: "overdue" }),
    invoice({ id: "3", number: 1003, issuedAt: iso(10), amount: 300, status: "sent" }),
    invoice({ id: "4", number: 1004, issuedAt: iso(2), amount: 900, status: "draft" }),
  ];
  const expenses = [expense({ id: "x", date: iso(15), amount: 200 })];

  it("runs the outstanding balance in date order and lists newest first", () => {
    const { entries } = buildStatement(invoices, expenses);
    expect(entries.map((e) => [e.key, e.balance])).toEqual([
      ["i-4", 800], // draft: listed, balance untouched
      ["i-3", 800],
      ["e-x", 500], // costs never move the balance
      ["i-2", 500],
      ["p-1", 0], // payment dated by paidAt
      ["i-1", 1000],
    ]);
  });

  it("closes on the account's outstanding total", () => {
    const { totals } = buildStatement(invoices, expenses);
    expect(totals).toEqual({ billed: 1800, received: 1000, cost: 200, balance: 800, invoices: 3, payments: 1 });
  });

  it("labels an overdue pill with the days past due, else plain Overdue", () => {
    expect(overdueLabel(invoice({ status: "overdue", dueAt: iso(6) }))).toBe("Overdue 6 days");
    expect(overdueLabel(invoice({ status: "overdue", dueAt: iso(-3) }))).toBe("Overdue");
  });
});

describe("StatementBar", () => {
  it("splits billed into paid and outstanding and explains a missing margin", () => {
    render(
      <StatementBar
        finance={{ billed: 1500, paid: 1000, outstanding: 500, overdue: 0, expenses: 0, margin: 0 }}
        invoices={[invoice({ id: "1", amount: 1000, status: "paid", paidAt: iso(3) }), invoice({ id: "2", amount: 500, status: "overdue", dueAt: iso(6) })]}
        expenses={[]}
      />,
    );
    expect(screen.getByRole("img", { name: /Billed to date: Paid ₹1,000, Outstanding ₹500/ })).toBeInTheDocument();
    expect(screen.getByText("Paid · 67%")).toBeInTheDocument();
    expect(screen.getByText("Outstanding · 33%")).toBeInTheDocument();
    expect(screen.getByText("1 invoice, 6 days overdue")).toBeInTheDocument();
    expect(screen.getByText("No expenses recorded")).toBeInTheDocument();
  });

  it("shows the margin once expenses exist", () => {
    render(<StatementBar finance={{ billed: 1000, paid: 1000, outstanding: 0, overdue: 0, expenses: 250, margin: 0.75 }} invoices={[]} expenses={[expense({ amount: 250 })]} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.queryByText("No expenses recorded")).not.toBeInTheDocument();
  });
});

function account(over: Partial<AccountListItem>): AccountListItem {
  return {
    id: "a",
    name: "Acct",
    domain: "",
    industry: "",
    status: "active",
    plan: "",
    value: 0,
    customerSince: iso(100),
    ownerId: "u1",
    ownerName: "Riya",
    primaryContact: null,
    contactCount: 0,
    lastActivityAt: iso(1),
    createdAt: iso(100),
    deletedAt: null,
    finance: { billed: 0, paid: 0, outstanding: 0, expenses: 0, margin: 0, overdue: 0 },
    ...over,
  };
}

describe("Accounts list", () => {
  beforeEach(() => {
    H.accounts = [
      account({ id: "a1", name: "Samarthya", ownerId: "u1", ownerName: "Riya", value: 50000, plan: "Starter", finance: { billed: 3000, paid: 1000, outstanding: 2000, expenses: 0, margin: 1, overdue: 1500 } }),
      account({ id: "a2", name: "Lumen", ownerId: "u2", ownerName: "Neha", finance: { billed: 500, paid: 500, outstanding: 0, expenses: 0, margin: 1, overdue: 0 } }),
    ];
  });

  async function renderPage() {
    const { default: AccountsPage } = await import("@/app/(app)/accounts/page");
    return render(<AccountsPage />);
  }

  it("renders ledger rows with finance columns and marks overdue outstanding", async () => {
    await renderPage();
    const row = screen.getByRole("link", { name: "Samarthya" }).closest("tr")!;
    expect(within(row).getByText("Starter")).toBeInTheDocument();
    expect(within(row).getByText(/₹1,500 overdue/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lumen" })).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "TD" && el.textContent === "Total · 2 accounts")).toBeInTheDocument();
  });

  it("summarises the visible set in one line", async () => {
    await renderPage();
    const summary = screen.getByRole("region", { name: "Summary" });
    expect(summary).toHaveTextContent("2 accounts worth ₹50k a month · ₹3.5k billed · ₹2k outstanding, ₹1.5k overdue across 1 account");
  });

  it("filters by owner", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Owner/ }));
    await userEvent.click(screen.getByRole("option", { name: /Neha/ }));
    expect(screen.queryByRole("link", { name: "Samarthya" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lumen" })).toBeInTheDocument();
  });
});

describe("Account detail", () => {
  beforeEach(() => {
    const base = "/api/accounts/a1";
    H.detail = {
      [base]: {
        account: account({ id: "a1", name: "Samarthya", plan: "Starter", value: 50000, ownerName: "Riya" }),
        finance: { billed: 1500, paid: 1000, outstanding: 500, overdue: 0, expenses: 0, margin: 0 },
      },
      [`${base}/contacts`]: { contacts: [{ id: "c1", name: "Ashish", title: "Proprietor", email: "a@s.in", phone: "+91 98765", isPrimary: true, note: "" }] },
      [`${base}/documents`]: { documents: [] },
      [`${base}/invoices`]: {
        invoices: [
          invoice({ id: "1", number: 1019, amount: 1000, status: "paid", paidAt: iso(3), hasFile: true }),
          invoice({ id: "2", number: 1023, amount: 500, status: "overdue", dueAt: iso(6) }),
        ],
      },
      [`${base}/expenses`]: { expenses: [] },
      [`${base}/activity`]: { activities: [] },
      [`${base}/audit`]: { entries: [] },
      "/api/reminders": { reminders: [] },
    };
  });

  async function renderDetail() {
    const { default: AccountDetailPage } = await import("@/app/(app)/accounts/[id]/page");
    // A pre-resolved thenable, so React's `use(params)` reads it without suspending.
    const params = Object.assign(Promise.resolve({ id: "a1" }), { status: "fulfilled", value: { id: "a1" } });
    render(<AccountDetailPage params={params} />);
    await screen.findByRole("heading", { level: 2, name: "Samarthya" });
  }

  it("shows the header facts, statement with inline actions and the primary contact rail", async () => {
    await renderDetail();
    expect(screen.getByText(/owned by Riya/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark invoice #1023 paid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download invoice #1019" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call Ashish" })).toHaveAttribute("href", "tel:+9198765");
    expect(screen.getByRole("link", { name: "Email Ashish" })).toHaveAttribute("href", "mailto:a@s.in");
  });

  it("switches tabs and opens the add-contact modal", async () => {
    await renderDetail();
    await userEvent.click(screen.getByRole("tab", { name: /Invoices/ }));
    expect(screen.getByRole("button", { name: "Remove invoice #1023" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add contact" }));
    expect(screen.getByRole("dialog", { name: "Add contact" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toHaveFocus();
  });

  it("offers archive in the overflow menu", async () => {
    await renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "More account actions" }));
    expect(screen.getByRole("menuitem", { name: "Log expense" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Archive account" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More account actions" })).toHaveFocus();
  });
});
