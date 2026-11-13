// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeadDTO } from "@/lib/types";

const { push, del } = vi.hoisted(() => ({ push: vi.fn(), del: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/lib/client", () => ({
  api: { delete: del, get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() },
  useApi: () => ({ data: null, loading: false, error: null, refresh: vi.fn(), setData: vi.fn() }),
}));

import { LeadTable } from "@/components/leads/LeadTable";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { ToastProvider } from "@/components/ui/Toast";

function lead(over: Partial<LeadDTO>): LeadDTO {
  return {
    id: "1",
    name: "Priya",
    company: "Lumen",
    title: "",
    phone: "",
    email: "",
    source: "Website",
    stage: "new",
    category: "finance",
    estValue: 0,
    notes: "",
    tags: [],
    lostReason: "",
    ownerId: "o1",
    ownerName: "Riya",
    convertedAccountId: null,
    order: 0,
    commentCount: 0,
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...over,
  };
}

function renderTable(leads: LeadDTO[], variant?: "active" | "lost") {
  const onChanged = vi.fn();
  render(
    <ToastProvider>
      <ConfirmProvider>
        <LeadTable leads={leads} variant={variant} onChanged={onChanged} />
      </ConfirmProvider>
    </ToastProvider>,
  );
  return { onChanged };
}

const names = () => screen.getAllByRole("link").map((a) => a.textContent);

beforeEach(() => vi.clearAllMocks());

describe("LeadTable", () => {
  it("renders full rupee amounts, a dash for zero, and the category tag", () => {
    renderTable([lead({ id: "a", estValue: 437096 }), lead({ id: "b", name: "Zero" })]);
    expect(screen.getByText("4,37,096", { exact: false })).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: "Zero" }).closest("tr")!).getAllByText("–").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Finance")).toHaveLength(2);
  });

  it("sorts by a column header and flips direction on a second click", async () => {
    const user = userEvent.setup();
    renderTable([lead({ id: "a", name: "Bela", estValue: 200 }), lead({ id: "b", name: "Amit", estValue: 100 }), lead({ id: "c", name: "Cara", estValue: 300 })]);
    await user.click(screen.getByRole("button", { name: "Sort by Est. value" }));
    expect(names()).toEqual(["Amit", "Bela", "Cara"]);
    await user.click(screen.getByRole("button", { name: "Sort by Est. value" }));
    expect(names()).toEqual(["Cara", "Bela", "Amit"]);
  });

  it("sorts stages along the board, not alphabetically", async () => {
    const user = userEvent.setup();
    renderTable([lead({ id: "a", name: "W", stage: "won" }), lead({ id: "b", name: "N", stage: "new" }), lead({ id: "c", name: "P", stage: "parked" })]);
    await user.click(screen.getByRole("button", { name: "Sort by Stage" }));
    expect(names()).toEqual(["N", "W", "P"]);
  });

  it("shows the lost reason in the Lost view", () => {
    renderTable([lead({ stage: "lost", lostReason: "Went with a competitor" })], "lost");
    expect(screen.getByRole("columnheader", { name: "Reason" })).toBeInTheDocument();
    expect(screen.getByText("Went with a competitor")).toBeInTheDocument();
  });

  it("opens the lead when a row is clicked", async () => {
    const user = userEvent.setup();
    renderTable([lead({ id: "x1" })]);
    await user.click(screen.getByText("Lumen", { selector: "td" }));
    expect(push).toHaveBeenCalledWith("/leads/x1");
  });

  it("archives the selected rows after confirming", async () => {
    const user = userEvent.setup();
    del.mockResolvedValue({});
    const { onChanged } = renderTable([lead({ id: "a", name: "Amit" }), lead({ id: "b", name: "Bela" })]);

    await user.click(screen.getByRole("checkbox", { name: "Select Amit" }));
    const bar = screen.getByRole("region", { name: "Selection" });
    expect(bar).toHaveTextContent("1 selected");
    await user.click(within(bar).getByRole("button", { name: "Archive" }));
    await user.click(within(screen.getByRole("dialog", { name: "Archive 1 lead?" })).getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(del).toHaveBeenCalledWith("/api/leads/a");
    expect(del).toHaveBeenCalledTimes(1);
  });
});
