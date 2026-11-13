// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeadDTO } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const { patch, post } = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/client", () => ({
  api: { patch, post, get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  useApi: () => ({ data: null, loading: false, error: null, refresh: vi.fn(), setData: vi.fn() }),
}));

import { LeadBoard } from "@/components/leads/LeadBoard";
import { ToastProvider } from "@/components/ui/Toast";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

function lead(over: Partial<LeadDTO>): LeadDTO {
  return {
    id: "1",
    name: "Priya Sharma",
    company: "Lumen Retail",
    title: "",
    phone: "",
    email: "",
    source: "Website",
    stage: "new",
    category: "unclassified",
    estValue: 120000,
    notes: "",
    tags: [],
    lostReason: "",
    ownerId: "o1",
    ownerName: "Riya",
    convertedAccountId: null,
    order: 0,
    commentCount: 0,
    lastActivityAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    deletedAt: null,
    ...over,
  };
}

function renderBoard(leads: LeadDTO[], props: Partial<React.ComponentProps<typeof LeadBoard>> = {}) {
  const onChanged = vi.fn();
  const onShowLost = vi.fn();
  render(
    <ToastProvider>
      <LeadBoard leads={leads} lostCount={4} onAdd={vi.fn()} onChanged={onChanged} onShowLost={onShowLost} {...props} />
    </ToastProvider>,
  );
  return { onChanged, onShowLost };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  patch.mockResolvedValue({});
});

describe("LeadBoard lanes", () => {
  it("renders the five funnel lanes with step, name, count and value", () => {
    renderBoard([lead({ id: "n1", stage: "new", estValue: 50000 }), lead({ id: "n2", stage: "new", estValue: 50000 })]);
    const heading = within(screen.getByTestId("col-new")).getByRole("heading");
    expect(heading).toHaveTextContent("1 New 2");
    expect(within(screen.getByTestId("col-new")).getByText("1L", { exact: false })).toBeInTheDocument();
    for (const s of ["contacted", "qualified", "proposal", "won"]) expect(screen.getByTestId(`col-${s}`)).toBeInTheDocument();
  });

  it("fills each header rule in proportion to the stage's share of pipeline value", () => {
    renderBoard([lead({ id: "n1", stage: "new", estValue: 25000 }), lead({ id: "w1", stage: "won", estValue: 75000 })]);
    expect(within(screen.getByTestId("col-new")).getByRole("img")).toHaveAccessibleName("25% of pipeline value");
    expect(within(screen.getByTestId("col-won")).getByRole("img")).toHaveAccessibleName("75% of pipeline value");
    expect(within(screen.getByTestId("col-proposal")).getByRole("img")).toHaveAccessibleName("0% of pipeline value");
  });

  it("caps a long lane and reveals the rest with the value still hidden", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 8 }, (_, i) => lead({ id: `n${i}`, name: `Lead ${i}`, order: i, estValue: 10000 }));
    renderBoard(many);
    expect(screen.queryByText("Lead 7")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2 more · ₹20k" }));
    expect(screen.getByText("Lead 7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();
  });

  it("shows Won as compact rows with a link to the converted account", () => {
    renderBoard([lead({ id: "w1", name: "Won Deal", stage: "won", convertedAccountId: "acc9" })]);
    const won = screen.getByTestId("col-won");
    expect(within(won).getByRole("link", { name: "View account" })).toHaveAttribute("href", "/accounts/acc9");
  });
});

describe("LeadBoard empty stages", () => {
  it("suggests the previous stage's leads and moves one in", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderBoard([
      lead({ id: "q1", name: "Naresh", stage: "qualified", estValue: 50000 }),
      lead({ id: "q2", name: "Ramkumar", stage: "qualified", estValue: 40000 }),
    ]);
    const proposal = screen.getByTestId("col-proposal");
    expect(within(proposal).getByText("Nothing in proposal")).toBeInTheDocument();
    expect(within(proposal).getByText(/are waiting/)).toHaveTextContent("2 qualified leads worth ₹90k are waiting. Send a proposal to move them here.");

    await user.click(within(proposal).getByRole("button", { name: "Move Naresh to Proposal" }));
    expect(patch).toHaveBeenCalledWith("/api/leads/q1/stage", { stage: "proposal", order: 0 });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(within(screen.getByTestId("col-proposal")).getByRole("link", { name: "Naresh" })).toBeInTheDocument();
  });
});

describe("LeadBoard keyboard moves", () => {
  it("moves a focused card with the number keys and opens the lost dialog with L", async () => {
    const user = userEvent.setup();
    renderBoard([lead({ id: "n1", name: "Asha", stage: "new" })]);

    screen.getByRole("link", { name: "Asha" }).focus();
    await user.keyboard("3");
    expect(patch).toHaveBeenCalledWith("/api/leads/n1/stage", { stage: "qualified", order: 0 });
    expect(within(screen.getByTestId("col-qualified")).getByRole("link", { name: "Asha" })).toBeInTheDocument();

    within(screen.getByTestId("col-qualified")).getByRole("link", { name: "Asha" }).focus();
    await user.keyboard("l");
    expect(screen.getByRole("dialog", { name: "Mark as lost" })).toBeInTheDocument();
  });

  it("describes the shortcuts to assistive tech", () => {
    renderBoard([lead({ id: "n1", name: "Asha" })]);
    expect(screen.getByRole("link", { name: "Asha" })).toHaveAccessibleDescription(/Press 1 to 5/);
  });
});

describe("LeadBoard parked + collapsible columns", () => {
  it("keeps Parked collapsed by default behind the shelf toggle", () => {
    renderBoard([lead({ id: "n1", name: "Active One", stage: "new" }), lead({ id: "p1", name: "Hari Nair", stage: "parked" })]);
    const toggle = screen.getByRole("button", { name: /Parked 1/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("col-parked")).not.toBeInTheDocument();
    expect(screen.queryByText("Hari Nair")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Active One" })).toBeInTheDocument();
  });

  it("expands the parked lane from the shelf, and collapses it again", async () => {
    const user = userEvent.setup();
    renderBoard([lead({ id: "p1", name: "Hari Nair", stage: "parked" })]);

    await user.click(screen.getByRole("button", { name: /Parked 1/ }));
    expect(screen.getByTestId("col-parked")).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByText("Hari Nair")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Parked" }));
    expect(screen.queryByText("Hari Nair")).not.toBeInTheDocument();
  });

  it("lets Won collapse to a slim rail, and keeps sequential lanes expanded", async () => {
    const user = userEvent.setup();
    renderBoard([lead({ id: "n1", name: "New Lead", stage: "new" }), lead({ id: "w1", name: "Won Deal", stage: "won" })]);

    expect(screen.queryByRole("button", { name: "Collapse New" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse Won" }));
    expect(screen.getByTestId("col-won")).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByText("Won Deal")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Won" }));
    expect(screen.getByText("Won Deal")).toBeInTheDocument();
  });

  it("opens and highlights the lane named by ?stage=, even when it was collapsed", () => {
    localStorage.setItem("mb.leads.board.collapsed", JSON.stringify(["won", "parked"]));
    renderBoard([lead({ id: "p1", name: "Hari Nair", stage: "parked" })], { focusStage: "parked" });
    expect(screen.getByTestId("col-parked")).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByText("Hari Nair")).toBeInTheDocument();
    expect(screen.getByTestId("col-won")).toHaveAttribute("data-collapsed", "true");
  });

  it("marks a focused funnel lane", () => {
    renderBoard([lead({})], { focusStage: "qualified" });
    expect(screen.getByTestId("col-qualified")).toHaveAttribute("data-focused", "true");
    expect(screen.getByTestId("col-new")).not.toHaveAttribute("data-focused");
  });

  it("opens the Lost view from the shelf", async () => {
    const user = userEvent.setup();
    const { onShowLost } = renderBoard([lead({})]);
    await user.click(screen.getByRole("button", { name: /Lost 4/ }));
    expect(onShowLost).toHaveBeenCalled();
  });
});

describe("LeadBoard inline quick-add", () => {
  it("adds a lead straight into the column's stage", async () => {
    const user = userEvent.setup();
    post.mockResolvedValueOnce({ lead: lead({ id: "x", name: "Meera", stage: "contacted" }) });
    const { onChanged } = renderBoard([lead({})]);
    const contacted = screen.getByTestId("col-contacted");

    await user.click(within(contacted).getByRole("button", { name: "Add lead" }));
    const form = within(contacted).getByRole("form", { name: "Add a lead to Contacted" });
    await user.click(within(form).getByRole("button", { name: "Add" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Add a name and a phone number.");
    expect(post).not.toHaveBeenCalled();

    await user.type(within(form).getByRole("textbox", { name: "Contact name" }), "Meera");
    await user.type(within(form).getByRole("textbox", { name: "Phone" }), "+91 98765 43210");
    await user.type(within(form).getByRole("textbox", { name: "Est. value (₹)" }), "45,000");
    await user.click(within(form).getByRole("button", { name: "Add" }));

    expect(post).toHaveBeenCalledWith("/api/leads", { name: "Meera", company: "", phone: "+91 98765 43210", estValue: 45000, stage: "contacted" });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});

describe("LeadBoard on phones", () => {
  it("shows one stage at a time behind a stage switch", async () => {
    const user = userEvent.setup();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      renderBoard([lead({ id: "n1", name: "Asha", stage: "new" }), lead({ id: "c1", name: "Bela", stage: "contacted" })]);
      expect(screen.getByRole("radiogroup", { name: "Stage" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Asha" })).toBeInTheDocument();
      expect(screen.queryByTestId("col-contacted")).not.toBeInTheDocument();

      await user.click(screen.getByRole("radio", { name: "Contacted" }));
      expect(screen.getByRole("link", { name: "Bela" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Asha" })).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});
