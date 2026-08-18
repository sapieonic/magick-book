// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeadDTO } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
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

function renderBoard(leads: LeadDTO[]) {
  return render(
    <ToastProvider>
      <LeadBoard leads={leads} onAdd={vi.fn()} onChanged={vi.fn()} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("LeadBoard parked + collapsible columns", () => {
  it("renders a Parked lane and collapses it by default", () => {
    renderBoard([
      lead({ id: "n1", name: "Active One", stage: "new" }),
      lead({ id: "p1", name: "Hari Nair", stage: "parked" }),
    ]);

    const parked = screen.getByTestId("col-parked");
    expect(parked).toHaveAttribute("data-collapsed", "true");
    expect(within(parked).getByText("Parked")).toBeInTheDocument();
    expect(screen.queryByText("Hari Nair")).not.toBeInTheDocument();
    expect(screen.getByText("Active One")).toBeInTheDocument();
  });

  it("expands the parked lane to show its cards", async () => {
    const user = userEvent.setup();
    renderBoard([lead({ id: "p1", name: "Hari Nair", stage: "parked" })]);

    await user.click(screen.getByRole("button", { name: "Expand Parked" }));

    const parked = screen.getByTestId("col-parked");
    expect(parked).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByText("Hari Nair")).toBeInTheDocument();
  });

  it("lets Won collapse to a slim rail, and keeps sequential lanes expanded", async () => {
    const user = userEvent.setup();
    renderBoard([
      lead({ id: "n1", name: "New Lead", stage: "new" }),
      lead({ id: "w1", name: "Won Deal", stage: "won" }),
    ]);

    expect(screen.getByTestId("col-new")).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByTestId("col-won")).toHaveAttribute("data-collapsed", "false");
    expect(screen.queryByRole("button", { name: "Collapse New" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse Won" }));
    expect(screen.getByTestId("col-won")).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByText("Won Deal")).not.toBeInTheDocument();
    expect(screen.getByText("New Lead")).toBeInTheDocument();
  });
});
