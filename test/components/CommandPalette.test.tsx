// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SessionUser } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const get = vi.fn();
vi.mock("@/lib/client", () => ({ api: { get: (url: string) => get(url) } }));

import { CommandPalette } from "@/components/layout/CommandPalette";
import { SessionProvider } from "@/components/layout/SessionContext";

const baseUser: SessionUser = {
  id: "u1",
  name: "Riya Admin",
  email: "riya@acme.in",
  role: "admin",
  status: "active",
  authProvider: "demo",
  workspaceId: "w1",
  workspaceName: "Acme",
};

function setup(over: Partial<SessionUser> = {}) {
  const onClose = vi.fn();
  const onNewLead = vi.fn();
  render(
    <SessionProvider user={{ ...baseUser, ...over }}>
      <CommandPalette open onClose={onClose} onNewLead={onNewLead} />
    </SessionProvider>,
  );
  return { user: userEvent.setup(), onClose, onNewLead, input: screen.getByRole("combobox", { name: "Search or jump to" }) };
}

const activeOption = (input: HTMLElement) => document.getElementById(input.getAttribute("aria-activedescendant")!)!;
const labels = () => screen.getAllByRole("option").map((o) => o.textContent);

beforeEach(() => {
  push.mockReset();
  get.mockReset();
  get.mockImplementation(async (url: string) =>
    url.startsWith("/api/leads")
      ? { leads: [{ id: "l1", name: "Naresh", company: "Shivasakthi group" }] }
      : { accounts: [{ id: "a1", name: "Samarthya Enterprise", industry: "Retail" }] },
  );
});

describe("CommandPalette", () => {
  it("renders nothing while closed", () => {
    render(
      <SessionProvider user={baseUser}>
        <CommandPalette open={false} onClose={() => {}} onNewLead={() => {}} />
      </SessionProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens as a modal dialog with the search field focused and the first command active", () => {
    const { input } = setup();
    expect(screen.getByRole("dialog", { name: "Command palette" })).toHaveAttribute("aria-modal", "true");
    expect(input).toHaveFocus();
    expect(labels()).toEqual(["New lead", "Today", "Leads", "Accounts", "Money", "Settings"]);
    expect(activeOption(input)).toHaveTextContent("New lead");
    expect(activeOption(input)).toHaveAttribute("aria-selected", "true");
  });

  it("hides Settings from standard users", () => {
    setup({ role: "standard" });
    expect(labels()).not.toContain("Settings");
  });

  it("moves with the arrow keys, wrapping at both ends, and jumps with Home / End", async () => {
    const { user, input } = setup();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(activeOption(input)).toHaveTextContent("Leads");
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(activeOption(input)).toHaveTextContent("Settings");
    await user.keyboard("{ArrowDown}");
    expect(activeOption(input)).toHaveTextContent("New lead");
    await user.keyboard("{End}");
    expect(activeOption(input)).toHaveTextContent("Settings");
    await user.keyboard("{Home}");
    expect(activeOption(input)).toHaveTextContent("New lead");
    expect(screen.getAllByRole("option").filter((o) => o.getAttribute("aria-selected") === "true")).toHaveLength(1);
  });

  it("runs the active command on Enter: navigation closes the palette and routes", async () => {
    const { user, onClose } = setup();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/leads");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs "New lead" on Enter', async () => {
    const { user, onClose, onNewLead } = setup();
    await user.keyboard("{Enter}");
    expect(onNewLead).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("closes on Escape without running anything", async () => {
    const { user, onClose, onNewLead } = setup();
    await user.keyboard("{ArrowDown}{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNewLead).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps Tab inside the dialog", async () => {
    const { user, input } = setup();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(input).toHaveFocus();
  });

  it("filters commands as you type and resets the active row", async () => {
    const { user, input } = setup();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    await user.type(input, "m");
    expect(labels()).toEqual(["Money"]);
    expect(activeOption(input)).toHaveTextContent("Money");
    expect(get).not.toHaveBeenCalled(); // one character is below the search threshold
  });

  it("searches leads and accounts through the list APIs and opens a result", async () => {
    const { user, input, onClose } = setup();
    await user.type(input, "sa & co");
    await waitFor(() => expect(screen.getByRole("option", { name: /Samarthya Enterprise/ })).toBeInTheDocument());
    expect(get).toHaveBeenCalledWith("/api/leads?q=sa%20%26%20co");
    expect(get).toHaveBeenCalledWith("/api/accounts?q=sa%20%26%20co");
    expect(labels()).toEqual(["NareshShivasakthi group", "Samarthya EnterpriseRetail"]);

    await user.keyboard("{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/accounts/a1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("says so when nothing matches, and survives a failed search", async () => {
    get.mockRejectedValue(new Error("boom"));
    const { user, input } = setup();
    await user.type(input, "zzzz");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No matches for “zzzz”"));
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(push).not.toHaveBeenCalled();
  });

  it("runs a command on click", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("option", { name: "Money" }));
    expect(push).toHaveBeenCalledWith("/money");
  });
});
