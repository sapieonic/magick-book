// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NavSummary, SessionUser } from "@/lib/types";
import { DATA_CHANGED } from "@/lib/dataChanged";

const nav = { pathname: "/leads", search: "" };
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
const refreshNav = vi.fn();
const summary: NavSummary = { openLeads: 3, accounts: 2, moneyDue: 0, recentAccounts: [] };
vi.mock("@/lib/client", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  useApi: () => ({ data: summary, setData: vi.fn(), error: null, loading: false, refresh: refreshNav }),
}));
vi.mock("@/components/leads/AddLeadDrawer", () => ({
  AddLeadDrawer: ({ defaultStage }: { defaultStage?: string }) => <div role="dialog" aria-label="Add lead" data-stage={defaultStage ?? ""} />,
}));

import { AppShell } from "@/components/layout/AppShell";
import { SessionProvider } from "@/components/layout/SessionContext";

const user: SessionUser = {
  id: "u1",
  name: "Riya Admin",
  email: "riya@acme.in",
  role: "admin",
  status: "active",
  authProvider: "demo",
  workspaceId: "w1",
  workspaceName: "Acme",
};

function renderShell() {
  return render(
    <SessionProvider user={user}>
      <AppShell>
        <p>page</p>
      </AppShell>
    </SessionProvider>,
  );
}

beforeEach(() => {
  nav.pathname = "/leads";
  nav.search = "";
  refreshNav.mockClear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

describe("AppShell sidebar counts", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("refreshes /api/nav once after a burst of mutations anywhere in the app", () => {
    renderShell();
    expect(refreshNav).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new Event(DATA_CHANGED));
      window.dispatchEvent(new Event(DATA_CHANGED));
    });
    act(() => vi.advanceTimersByTime(200));
    expect(refreshNav).toHaveBeenCalledTimes(1);
  });
});

describe("AppShell New drawer", () => {
  async function openDrawer() {
    renderShell();
    await userEvent.click(screen.getAllByRole("button", { name: "New lead" })[0]);
    return screen.getByRole("dialog", { name: "Add lead" });
  }

  it("starts in the open-funnel stage the leads board is focused on", async () => {
    nav.search = "stage=qualified";
    expect(await openDrawer()).toHaveAttribute("data-stage", "qualified");
  });

  it("falls back to New for won, unknown stages and other pages", async () => {
    nav.search = "stage=won";
    expect(await openDrawer()).toHaveAttribute("data-stage", "");
    cleanup();
    nav.search = "stage=qualified";
    nav.pathname = "/accounts";
    expect(await openDrawer()).toHaveAttribute("data-stage", "");
  });
});
