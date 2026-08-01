// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeadDTO } from "@/lib/types";

// Shared, mutable state the mocks read from. `vi.hoisted` so it exists before the
// hoisted vi.mock factories run.
const H = vi.hoisted(() => ({
  leads: [] as unknown[],
  archived: [] as unknown[],
  params: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => H.params,
  useRouter: () => ({ replace: H.replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/leads",
}));

vi.mock("@/components/layout/SessionContext", () => ({
  useSession: () => ({
    id: "me",
    name: "Riya",
    email: "riya@acme.in",
    role: "admin",
    status: "active",
    authProvider: "demo",
    workspaceId: "w1",
    workspaceName: "Acme",
  }),
}));

vi.mock("@/lib/client", () => ({
  useApi: (url: string | null) => {
    if (url == null) return { data: null, setData: vi.fn(), error: null, loading: false, refresh: vi.fn() };
    const archived = url.includes("archived=1");
    return {
      data: { leads: archived ? H.archived : H.leads },
      setData: vi.fn(),
      error: null,
      loading: false,
      refresh: vi.fn(),
    };
  },
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  ApiError: class extends Error {},
}));

// Stub the heavy children; expose the leads they receive so we can assert filtering.
vi.mock("@/components/layout/Sidebar", () => ({
  PageHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/leads/LeadBoard", () => ({
  LeadBoard: ({ leads }: { leads: LeadDTO[] }) => (
    <div data-testid="board">
      {leads.map((l) => (
        <span key={l.id} data-testid="board-lead">{l.id}</span>
      ))}
    </div>
  ),
}));
vi.mock("@/components/leads/LeadTable", () => ({
  LeadTable: ({ leads }: { leads: LeadDTO[] }) => (
    <div data-testid="table">
      {leads.map((l) => (
        <span key={l.id} data-testid="table-lead">{l.id}</span>
      ))}
    </div>
  ),
}));
vi.mock("@/components/leads/AddLeadDrawer", () => ({ AddLeadDrawer: () => null }));

import LeadsPage from "@/app/(app)/leads/page";
import { ToastProvider } from "@/components/ui/Toast";

let seq = 0;
function lead(over: Partial<LeadDTO>): LeadDTO {
  return {
    id: `lead-${seq++}`,
    name: "Lead",
    company: "",
    title: "",
    phone: "",
    email: "",
    source: "Website",
    stage: "new",
    estValue: 1000,
    notes: "",
    tags: [],
    lostReason: "",
    ownerId: "a",
    ownerName: "Amit",
    convertedAccountId: null,
    order: 0,
    commentCount: 0,
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...over,
  };
}

function setup({ search = "", leads = [] as LeadDTO[], archived = [] as LeadDTO[] } = {}) {
  H.params = new URLSearchParams(search);
  H.leads = leads;
  H.archived = archived;
}

function renderPage() {
  return render(
    <ToastProvider>
      <LeadsPage />
    </ToastProvider>,
  );
}

const boardIds = () => screen.queryAllByTestId("board-lead").map((n) => n.textContent);
const ownerTrigger = () =>
  screen.getAllByRole("button").find((b) => b.getAttribute("aria-haspopup") === "listbox");

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

describe("Leads page — owner filter integration", () => {
  it("shows all leads on the board when no filter is applied", () => {
    setup({
      leads: [lead({ id: "1", ownerId: "a" }), lead({ id: "2", ownerId: "b", ownerName: "Bela" })],
    });
    renderPage();
    expect(boardIds()).toEqual(["1", "2"]);
  });

  it("seeds the owner filter from the ?owner= URL param and filters the board", () => {
    setup({
      search: "owner=a",
      leads: [
        lead({ id: "1", ownerId: "a" }),
        lead({ id: "2", ownerId: "b", ownerName: "Bela" }),
        lead({ id: "3", ownerId: "a" }),
      ],
    });
    renderPage();
    expect(boardIds()).toEqual(["1", "3"]);
  });

  it("seeds and de-dupes a multi-owner param", () => {
    setup({
      search: "owner=a,b,a",
      leads: [
        lead({ id: "1", ownerId: "a" }),
        lead({ id: "2", ownerId: "b", ownerName: "Bela" }),
        lead({ id: "3", ownerId: "c", ownerName: "Cara" }),
      ],
    });
    renderPage();
    expect(boardIds()).toEqual(["1", "2"]);
    // The trigger reflects two selected owners.
    expect(ownerTrigger()).toHaveTextContent("2 owners");
  });

  it("hides the owner control when there is only one owner and no active filter", () => {
    setup({ leads: [lead({ id: "1", ownerId: "a" }), lead({ id: "2", ownerId: "a" })] });
    renderPage();
    expect(ownerTrigger()).toBeUndefined();
  });

  it("shows the owner control when the workspace has more than one owner", () => {
    setup({
      leads: [lead({ id: "1", ownerId: "a" }), lead({ id: "2", ownerId: "b", ownerName: "Bela" })],
    });
    renderPage();
    expect(ownerTrigger()).toBeDefined();
  });

  it("keeps the control mounted for a stale deep-link even when it collapses the pool to one owner", () => {
    // Only owner 'a' exists, but the URL selects a ghost id → filter active, board empty.
    setup({ search: "owner=ghost", leads: [lead({ id: "1", ownerId: "a" }), lead({ id: "2", ownerId: "a" })] });
    renderPage();
    expect(boardIds()).toEqual([]);
    // Control is still available (ownerIds is non-empty) so the filter can be cleared.
    expect(ownerTrigger()).toBeDefined();
  });

  it("selecting an owner filters the board and writes the ?owner= param to the URL", async () => {
    const user = userEvent.setup();
    setup({
      leads: [
        lead({ id: "1", ownerId: "a" }),
        lead({ id: "2", ownerId: "b", ownerName: "Bela" }),
      ],
    });
    renderPage();
    expect(H.replace).not.toHaveBeenCalled(); // clean visit: no churn

    await user.click(ownerTrigger()!);
    await user.click(screen.getByRole("option", { name: /Bela/ }));

    expect(boardIds()).toEqual(["2"]);
    expect(H.replace).toHaveBeenCalledWith("/leads?owner=b", { scroll: false });
  });

  it("does not fire a redundant navigation on a clean visit", () => {
    setup({
      leads: [lead({ id: "1", ownerId: "a" }), lead({ id: "2", ownerId: "b", ownerName: "Bela" })],
    });
    renderPage();
    expect(H.replace).not.toHaveBeenCalled();
  });
});

describe("Leads page — empty state clearing", () => {
  it("offers a Clear filters action that resets the filter and restores the board", async () => {
    const user = userEvent.setup();
    setup({
      search: "owner=ghost",
      leads: [lead({ id: "1", ownerId: "a" }), lead({ id: "2", ownerId: "b", ownerName: "Bela" })],
    });
    renderPage();
    expect(boardIds()).toEqual([]);

    await user.click(screen.getByRole("button", { name: /Clear filters/i }));

    expect(boardIds()).toEqual(["1", "2"]);
    expect(H.replace).toHaveBeenLastCalledWith("/leads", { scroll: false });
  });
});

describe("Leads page — composing search and owner filter in the URL", () => {
  it("preserves the search term when the owner filter is cleared", async () => {
    const user = userEvent.setup();
    setup({
      search: "q=acme&owner=a",
      leads: [lead({ id: "1", ownerId: "a" }), lead({ id: "2", ownerId: "b", ownerName: "Bela" })],
    });
    renderPage();
    // Clear just the owner filter via the corner badge.
    await user.click(screen.getByRole("button", { name: /Clear owner filter/i }));
    expect(H.replace).toHaveBeenLastCalledWith("/leads?q=acme", { scroll: false });
  });
});

describe("Leads page — filter applies across views", () => {
  it("filters the Lost view by owner", async () => {
    const user = userEvent.setup();
    setup({
      search: "owner=a",
      leads: [
        lead({ id: "L1", ownerId: "a", stage: "lost" }),
        lead({ id: "L2", ownerId: "b", ownerName: "Bela", stage: "lost" }),
      ],
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: /Lost/ }));
    expect(screen.queryAllByTestId("table-lead").map((n) => n.textContent)).toEqual(["L1"]);
  });

  it("filters the Archived view by owner", async () => {
    const user = userEvent.setup();
    setup({
      search: "owner=a",
      leads: [lead({ id: "1", ownerId: "a" }), lead({ id: "2", ownerId: "b", ownerName: "Bela" })],
      archived: [
        lead({ id: "AR1", ownerId: "a", name: "Archived-A" }),
        lead({ id: "AR2", ownerId: "b", ownerName: "Bela", name: "Archived-B" }),
      ],
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Archived" }));
    // The archived table renders one row (owner 'a') and not the 'b' row.
    expect(screen.getByText("Archived-A")).toBeInTheDocument();
    expect(screen.queryByText("Archived-B")).not.toBeInTheDocument();
  });

  it("shows a Clear filters action in the archived empty state when a filter hides everything", async () => {
    const user = userEvent.setup();
    setup({
      search: "owner=ghost",
      leads: [lead({ id: "1", ownerId: "a" }), lead({ id: "2", ownerId: "b", ownerName: "Bela" })],
      archived: [lead({ id: "AR1", ownerId: "a", name: "Archived-A" })],
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Archived" }));
    expect(screen.getByText(/No archived leads match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear filters/i })).toBeInTheDocument();
  });
});
