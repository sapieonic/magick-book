// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import type { DashboardData, WorkItem } from "@/lib/types";

const H = vi.hoisted(() => ({
  data: null as unknown,
  refresh: vi.fn(),
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/client", () => ({
  useApi: () => ({ data: H.data, setData: vi.fn(), error: null, loading: false, refresh: H.refresh }),
  api: H.api,
  ApiError: class extends Error {},
}));

import DashboardPage from "@/app/(app)/dashboard/page";
import { summaryPhrases, collectedComparison, ageWords, dueWords } from "@/components/dashboard/format";

const AS_OF = new Date(2026, 10, 13, 10, 0).toISOString(); // Friday 13 November 2026
const daysBefore = (n: number) => new Date(new Date(AS_OF).getTime() - n * 86400000).toISOString();

const blank = { stage: null, value: 0, dueAt: null, lastTouchedAt: null, leadId: null, reminderId: null, invoiceId: null, invoiceNumber: null, company: "", href: null };
const queue: WorkItem[] = [
  { ...blank, id: "inv-1", kind: "invoice", title: "Chase payment from Artha", name: "Artha", value: 18880, dueAt: daysBefore(70), lastTouchedAt: daysBefore(3), ownerName: "Pooja K", invoiceId: "i1", invoiceNumber: 1016, href: "/accounts/a1?tab=invoices" },
  { ...blank, id: "lead-1", kind: "followup", title: "Call back Naresh", name: "Naresh", company: "Shivasakthi", stage: "qualified", value: 50000, lastTouchedAt: daysBefore(120), ownerName: "Pooja K", leadId: "l1", href: "/leads/l1" },
  { ...blank, id: "reminder-1", kind: "reminder", title: "Send revised quote", name: "Ramkumar", value: 0, dueAt: AS_OF, lastTouchedAt: daysBefore(2), ownerName: "Riya", reminderId: "r1" },
];

function sample(over: Partial<DashboardData> = {}): DashboardData {
  return {
    asOf: AS_OF,
    openLeads: 22,
    openValue: 470000,
    qualified: 4,
    wonThisMonth: 0,
    wonConverted: 10,
    activeAccounts: 11,
    pipeline: [
      { stage: "new", count: 7, value: 110000, oldest: { id: "l9", name: "bhargav", company: "", lastActivityAt: daysBefore(120) }, latest: null },
      { stage: "contacted", count: 11, value: 220000, oldest: null, latest: null },
      { stage: "qualified", count: 4, value: 140000, oldest: null, latest: null },
      { stage: "proposal", count: 0, value: 0, oldest: null, latest: null },
      { stage: "won", count: 10, value: 810000, oldest: null, latest: { id: "l5", name: "W", company: "Samarthya", lastActivityAt: daysBefore(17) } },
    ],
    queue,
    receivables: {
      billed: 2650000,
      outstanding: 1040000,
      aging: { current: 1020, d1_30: 1021812, d31_60: 0, d60plus: 18880 },
      owingAccounts: 4,
      debtors: [{ accountId: "a2", name: "Samarthya", amount: 791096, invoices: 2 }],
      collected: { thisMonth: 1840, lastMonth: 590000, payments: 1, latest: { accountId: "a3", accountName: "Brewtiful", number: 1018 } },
    },
    upcoming: [{ id: "u1", title: "Renewal call", dueAt: new Date(2026, 10, 18, 11).toISOString(), entityLabel: "Ashish", href: null }],
    revenueThisMonth: 0,
    revenueDeltaPct: 0,
    attention: [],
    ...over,
  };
}

function renderPage() {
  return render(
    <ConfirmProvider>
      <DashboardPage />
    </ConfirmProvider>,
  );
}

beforeEach(() => {
  H.data = sample();
  H.refresh.mockReset();
  Object.values(H.api).forEach((f) => f.mockReset().mockResolvedValue({}));
});

describe("format helpers", () => {
  it("writes the summary sentence from live figures", () => {
    const text = summaryPhrases(sample()).map((p) => p.text).join("");
    expect(text).toBe("22 open leads worth ₹4.7L. ₹10.4L is outstanding across 4 accounts. 2 follow-ups are waiting, and nothing has been won yet this month.");
  });

  it("handles a quiet day", () => {
    const quiet = sample({ openLeads: 0, queue: [], wonThisMonth: 1, receivables: { ...sample().receivables, outstanding: 0, owingAccounts: 0 } });
    expect(summaryPhrases(quiet).map((p) => p.text).join("")).toBe(
      "No open leads. Nothing is outstanding. No follow-ups are waiting, and 1 lead won this month.",
    );
  });

  it("compares collections and ages in words", () => {
    expect(collectedComparison(1840, 590000, "October")).toBe("down from ₹5.9L in October");
    expect(collectedComparison(9000, 100, "October")).toBe("up from ₹100 in October");
    expect(collectedComparison(5, 0, "October")).toBe("nothing collected in October");
    const now = new Date(AS_OF);
    expect(ageWords(daysBefore(0), now)).toBe("today");
    expect(ageWords(daysBefore(17), now)).toBe("17 days");
    expect(ageWords(daysBefore(120), now)).toBe("4 months");
    expect(dueWords(daysBefore(3), now)).toBe("due 3 days ago");
  });
});

describe("Today page", () => {
  it("renders the brief, ribbon, queue, stage table and receivables rail", () => {
    renderPage();
    expect(screen.getByText("Friday, 13 November 2026")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Pipeline by value" })).toBeInTheDocument();
    expect(screen.getAllByText("Empty stage").length).toBeGreaterThan(0);
    expect(screen.getByText(/converted to 10 accounts/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Work queue/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pipeline by stage" })).toBeInTheDocument();
    expect(screen.getByText("4 qualified leads could move here")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Aging: Not yet due ₹1,020/ })).toBeInTheDocument();
    expect(screen.getByText("down from ₹5.9L in October")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Collected in November" })).toBeInTheDocument();
    expect(screen.getByText("Renewal call")).toBeInTheDocument();
    const rail = screen.getByRole("complementary", { name: "Receivables" });
    expect(within(rail).getByRole("link", { name: /Samarthya/ })).toHaveAttribute("href", "/accounts/a2?tab=invoices");
  });

  it("shows every queue row with its overdue age", () => {
    renderPage();
    const table = screen.getAllByRole("table")[0];
    expect(within(table).getAllByRole("row")).toHaveLength(queue.length + 1);
    expect(within(table).getByText("70 days overdue")).toBeInTheDocument();
    expect(within(table).getByText("4 months")).toHaveClass("text-overdue");
  });

  it("completes and snoozes reminders through the reminders API", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("button", { name: "Done with reminder: Send revised quote" })[0]);
    expect(H.api.patch).toHaveBeenCalledWith("/api/reminders/r1", { action: "complete" });
    await user.click(screen.getAllByRole("button", { name: "Snooze reminder until tomorrow: Send revised quote" })[0]);
    expect(H.api.patch).toHaveBeenCalledWith("/api/reminders/r1", { action: "snooze", dueAt: new Date(2026, 10, 14, 9).toISOString() });
    expect(H.refresh).toHaveBeenCalledTimes(2);
  });

  it("sends an invoice reminder and marks it paid after confirming", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("button", { name: "Send reminder for invoice #1016" })[0]);
    expect(H.api.patch).toHaveBeenCalledWith("/api/invoices/i1", { action: "remind" });
    await user.click(screen.getAllByRole("button", { name: "Mark paid: invoice #1016" })[0]);
    await user.click(await screen.findByRole("button", { name: "Mark paid" }));
    expect(H.api.patch).toHaveBeenCalledWith("/api/invoices/i1", { status: "paid" });
  });

  it("logs a call on a follow-up from the modal", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("button", { name: "Log call for Naresh · Shivasakthi" })[0]);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("What happened?"), "Asked for a revised quote");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(H.api.post).toHaveBeenCalledWith("/api/leads/l1/activities", { kind: "call", detail: "Asked for a revised quote" });
    expect(H.refresh).toHaveBeenCalled();
  });

  it("shows a designed empty queue", () => {
    H.data = sample({ queue: [] });
    renderPage();
    expect(screen.getByText("Nothing is waiting on you")).toBeInTheDocument();
  });
});
