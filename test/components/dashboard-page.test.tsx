// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { DATA_CHANGED } from "@/lib/dataChanged";
import type { DashboardData, WorkItem } from "@/lib/types";

const H = vi.hoisted(() => ({
  data: null as unknown,
  refresh: vi.fn(),
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/client", () => ({
  useApi: () => ({ data: H.data, setData: vi.fn(), error: null, loading: false, refresh: H.refresh }),
  api: H.api,
}));

import DashboardPage from "@/app/(app)/dashboard/page";
import { summaryPhrases, collectedComparison } from "@/components/dashboard/format";

const AS_OF = new Date("2026-11-13T10:00:00+05:30").toISOString(); // Friday 13 November 2026, 10am IST
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
      aging: [
        { key: "current", amount: 1020, count: 1, accounts: [] },
        { key: "d30", amount: 1021812, count: 2, accounts: [] },
        { key: "d60", amount: 0, count: 0, accounts: [] },
        { key: "d60plus", amount: 18880, count: 1, accounts: [] },
      ],
      owingAccounts: 4,
      debtors: [{ accountId: "a2", name: "Samarthya", amount: 791096, invoices: 2 }],
      collected: { thisMonth: 1840, lastMonth: 590000, payments: 1, latest: { accountId: "a3", accountName: "Brewtiful", number: 1018 } },
    },
    upcoming: [{ id: "u1", title: "Renewal call", dueAt: new Date("2026-11-18T11:00:00+05:30").toISOString(), entityLabel: "Ashish", href: null }],
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
  // Like the real `api`: every successful mutation announces a data change.
  Object.values(H.api).forEach((f) =>
    f.mockReset().mockImplementation(async () => {
      if (f !== H.api.get) window.dispatchEvent(new Event(DATA_CHANGED));
      return {};
    }),
  );
});

/** Wait out the change-event debounce, so a second (redundant) refresh would have landed. */
const settle = () => act(() => new Promise((r) => setTimeout(r, 250)));

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

  it("compares collections in words", () => {
    expect(collectedComparison(1840, 590000, "October")).toBe("down from ₹5.9L in October");
    expect(collectedComparison(9000, 100, "October")).toBe("up from ₹100 in October");
    expect(collectedComparison(5, 0, "October")).toBe("nothing collected in October");
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

  it("links each pipeline stage to the board filtered to it", () => {
    renderPage();
    const ribbon = screen.getByRole("group", { name: "Pipeline by value" });
    expect(within(ribbon).getAllByRole("link")[0]).toHaveAttribute("href", "/leads?stage=new");
    const stageTable = screen.getByRole("heading", { name: "Pipeline by stage" }).closest("section")!;
    expect(within(stageTable).getByRole("link", { name: "Won" })).toHaveAttribute("href", "/leads?stage=won");
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
    await settle();
    expect(H.refresh).toHaveBeenCalledTimes(1); // once per action: the change event, no extra explicit reload
    await user.click(screen.getAllByRole("button", { name: "Snooze reminder until tomorrow: Send revised quote" })[0]);
    expect(H.api.patch).toHaveBeenCalledWith("/api/reminders/r1", { action: "snooze", dueAt: new Date("2026-11-14T09:00:00+05:30").toISOString() });
    await settle();
    expect(H.refresh).toHaveBeenCalledTimes(2);
  });

  it("sends an invoice reminder and marks it paid after confirming", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("button", { name: "Send reminder for invoice #1016" })[0]);
    expect(H.api.patch).toHaveBeenCalledWith("/api/invoices/i1", { action: "remind" });
    await settle();
    expect(H.refresh).toHaveBeenCalledTimes(1);
    await user.click(screen.getAllByRole("button", { name: "Mark paid: invoice #1016" })[0]);
    await user.click(await screen.findByRole("button", { name: "Mark paid" }));
    expect(H.api.patch).toHaveBeenCalledWith("/api/invoices/i1", { status: "paid" });
    await settle();
    expect(H.refresh).toHaveBeenCalledTimes(2); // one reload per action
  });

  it("logs a call on a follow-up from the modal", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("button", { name: "Log call for Naresh · Shivasakthi" })[0]);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Call notes"), "Asked for a revised quote");
    await user.click(within(dialog).getByRole("button", { name: "Log call" }));
    expect(H.api.post).toHaveBeenCalledWith("/api/leads/l1/activities", { kind: "call", detail: "Asked for a revised quote" });
    await waitFor(() => expect(H.refresh).toHaveBeenCalled());
    await settle();
    expect(H.refresh).toHaveBeenCalledTimes(1);
  });

  it("collapses the phone queue to the first four rows", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 6 }, (_, i) => ({ ...queue[1], id: `lead-${i}`, title: `Call back #${i}` }));
    H.data = sample({ queue: many });
    renderPage();
    const panel = screen.getByRole("heading", { name: /Work queue/ }).closest("section")!;
    const list = within(panel).getByRole("list");
    expect(list.children).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(list.children).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows a designed empty queue", () => {
    H.data = sample({ queue: [] });
    renderPage();
    expect(screen.getByText("Nothing is waiting on you")).toBeInTheDocument();
  });
});
