// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NavSummary, SessionUser } from "@/lib/types";

const nav = { pathname: "/leads/abc", push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: nav.refresh }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
const post = vi.fn(async () => ({}));
vi.mock("@/lib/client", () => ({ api: { post: (url: string) => post(url) } }));

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Page, PageSplit } from "@/components/layout/Page";
import { ShellContext, type Shell } from "@/components/layout/ShellContext";
import { SessionProvider } from "@/components/layout/SessionContext";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const admin: SessionUser = {
  id: "u1",
  name: "Riya Admin",
  email: "riya@acme.in",
  role: "admin",
  status: "active",
  authProvider: "demo",
  workspaceId: "w1",
  workspaceName: "Acme",
};
const summary: NavSummary = {
  openLeads: 22,
  accounts: 11,
  moneyDue: 1040000,
  recentAccounts: [{ id: "a1", name: "Samarthya Enterprise" }],
};

function renderSidebar(user: SessionUser = admin, data: NavSummary | null = summary) {
  return render(
    <ThemeProvider>
      <SessionProvider user={user}>
        <Sidebar summary={data} />
      </SessionProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  nav.pathname = "/leads/abc";
  nav.replace.mockReset();
  nav.refresh.mockReset();
  post.mockClear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

describe("Sidebar", () => {
  it("labels each destination with its live count and marks the current section", () => {
    renderSidebar();
    const primary = screen.getByRole("navigation", { name: "Primary" });
    expect(within(primary).getByRole("link", { name: "Leads, 22" })).toHaveAttribute("aria-current", "page");
    expect(within(primary).getByRole("link", { name: "Accounts, 11" })).not.toHaveAttribute("aria-current");
    expect(within(primary).getByRole("link", { name: "Money, ₹10.4L due" })).toHaveAttribute("href", "/money");
    expect(within(primary).getByRole("link", { name: "Today" })).toHaveAttribute("href", "/dashboard");
    expect(within(primary).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings/team");
    expect(within(primary).getByRole("link", { name: "Samarthya Enterprise" })).toHaveAttribute("href", "/accounts/a1");
  });

  it("drops zero counts, hides Settings from standard users and renders before counts load", () => {
    renderSidebar({ ...admin, role: "standard" }, { openLeads: 0, accounts: 0, moneyDue: 0, recentAccounts: [] });
    expect(screen.getByRole("link", { name: "Leads" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Money" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.queryByText("Recent accounts")).toBeNull();
  });

  it("opens the user menu with theme, help and sign out; Escape closes it", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const trigger = screen.getByRole("button", { name: "Account menu for Riya Admin" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Help & support" })).toHaveAttribute("href", "mailto:help@magickbook.app");

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("signs out through the logout API and returns to /login", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByRole("button", { name: "Account menu for Riya Admin" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
    expect(post).toHaveBeenCalledWith("/api/auth/logout");
    expect(nav.refresh).toHaveBeenCalled();
  });
});

describe("MobileTabBar", () => {
  it("shows the four destinations around a New lead button", async () => {
    const user = userEvent.setup();
    const shell: Shell = { titleSlot: null, actionsSlot: null, openPalette: vi.fn(), newLead: vi.fn() };
    nav.pathname = "/dashboard";
    render(
      <ShellContext.Provider value={shell}>
        <MobileTabBar />
      </ShellContext.Provider>,
    );
    const bar = screen.getByRole("navigation", { name: "Primary" });
    expect(Array.from(bar.children).map((c) => c.textContent || "New lead")).toEqual(["Today", "Leads", "New lead", "Accounts", "Money"]);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "New lead" }));
    expect(shell.newLead).toHaveBeenCalledTimes(1);
  });
});

describe("PageHeader", () => {
  it("falls back to an inline header outside the shell", () => {
    render(
      <PageHeader title="Naresh" breadcrumb={[{ label: "Leads", href: "/leads" }]} actions={<button>Convert</button>}>
        <span>Qualified</span>
      </PageHeader>,
    );
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("heading", { level: 1, name: "Naresh" })).toBeInTheDocument();
    expect(within(header).getByRole("navigation", { name: "Breadcrumb" })).toContainElement(screen.getByRole("link", { name: "Leads" }));
    expect(within(header).getByText("Qualified")).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Convert" })).toBeInTheDocument();
  });

  it("portals the title and actions into the shell's top-bar slots", () => {
    const titleSlot = document.body.appendChild(document.createElement("div"));
    const actionsSlot = document.body.appendChild(document.createElement("div"));
    const shell: Shell = { titleSlot, actionsSlot, openPalette: vi.fn(), newLead: vi.fn() };
    const { container, unmount } = render(
      <ShellContext.Provider value={shell}>
        <PageHeader title="Money" actions={<button>Export</button>} />
      </ShellContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(within(titleSlot).getByRole("heading", { level: 1, name: "Money" })).toBeInTheDocument();
    expect(within(actionsSlot).getByRole("button", { name: "Export" })).toBeInTheDocument();
    unmount();
    expect(titleSlot).toBeEmptyDOMElement();
    expect(actionsSlot).toBeEmptyDOMElement();
  });
});

describe("Page / PageSplit", () => {
  it("puts the context rail in a labelled aside beside the main region from xl up", () => {
    const { container } = render(
      <Page>
        <PageSplit rail={<div>rail panel</div>} railLabel="Receivables">
          <div>main panel</div>
        </PageSplit>
      </Page>,
    );
    expect(screen.getByRole("complementary", { name: "Receivables" })).toHaveTextContent("rail panel");
    expect(container.querySelector(".grid")).toHaveClass("grid-cols-1", "xl:grid-cols-[minmax(0,1fr)_400px]");
  });

  it("is a single column without a rail", () => {
    const { container } = render(<PageSplit><div>main</div></PageSplit>);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(container.querySelector(".grid")).not.toHaveClass("xl:grid-cols-[minmax(0,1fr)_400px]");
  });
});
