// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MemberDTO, ReminderSettingDTO } from "@/lib/types";

const H = vi.hoisted(() => ({
  role: "admin" as "admin" | "standard",
  pathname: "/settings/team",
  responses: {} as Record<string, unknown>,
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => H.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: H.replace, refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/components/layout/SessionContext", () => ({
  useSession: () => ({ id: "me", name: "Riya Nair", email: "riya@acme.in", role: H.role, status: "active", authProvider: "demo", workspaceId: "w1", workspaceName: "Acme" }),
}));

vi.mock("@/lib/client", () => ({
  useApi: (url: string | null) => ({
    data: url == null ? null : (H.responses[url.split("?")[0]] ?? null),
    setData: vi.fn(),
    error: null,
    loading: false,
    refresh: vi.fn(),
  }),
  api: H.api,
}));

import { SettingsTabs } from "@/components/settings/SettingsTabs";
import TeamPage from "@/app/(app)/settings/team/page";
import AuditLogPage from "@/app/(app)/settings/audit/page";
import { WebhookForm } from "@/components/reminders/WebhookForm";
import { LoginClient } from "@/app/login/LoginClient";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";

function wrap(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <ConfirmProvider>{ui}</ConfirmProvider>
    </ToastProvider>,
  );
}

function member(over: Partial<MemberDTO>): MemberDTO {
  return { id: "m", name: "M", email: "m@acme.in", role: "standard", status: "active", invitedByName: null, isYou: false, isOwner: false, ...over };
}

beforeEach(() => {
  H.role = "admin";
  H.pathname = "/settings/team";
  H.responses = {};
  Object.values(H.api).forEach((f) => f.mockReset());
  H.replace.mockReset();
});

describe("SettingsTabs", () => {
  it("marks the current section", () => {
    H.pathname = "/settings/reminders";
    render(<SettingsTabs />);
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(within(nav).getByRole("link", { name: "Reminders" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Team & roles" })).not.toHaveAttribute("aria-current");
  });
});

describe("Team page", () => {
  const members = [
    member({ id: "riya", name: "Riya Nair", role: "admin", isYou: true, isOwner: true }),
    member({ id: "karan", name: "Karan Rao", role: "admin", invitedByName: "Riya Nair" }),
    member({ id: "sam", name: "Sam Toh", status: "invited" }),
  ];

  it("lets an admin change roles and remove others, never the owner", async () => {
    H.responses["/api/members"] = { members, isAdmin: true };
    H.api.patch.mockResolvedValue({});
    H.api.delete.mockResolvedValue({});
    wrap(<TeamPage />);

    expect(screen.queryByRole("combobox", { name: "Role for Riya Nair" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Riya Nair" })).toBeNull();
    expect(screen.getByText("owner")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Role for Sam Toh" }), "admin");
    expect(H.api.patch).toHaveBeenCalledWith("/api/members/sam", { role: "admin" });

    await userEvent.click(screen.getByRole("button", { name: "Remove Karan Rao" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(H.api.delete).toHaveBeenCalledWith("/api/members/karan"));
  });

  it("shows the admins-only state to a standard user", () => {
    H.role = "standard";
    H.responses["/api/members"] = { members, isAdmin: false };
    wrap(<TeamPage />);
    expect(screen.getByText("Admins only")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: /invite/i })).toBeNull();
  });
});

describe("Audit log page", () => {
  it("is admin-only", () => {
    H.role = "standard";
    wrap(<AuditLogPage />);
    expect(screen.getByText("Admins only")).toBeInTheDocument();
  });

  it("offers record, change and person filters", () => {
    H.responses["/api/audit"] = { entries: [] };
    H.responses["/api/members"] = { members: [member({ id: "karan", name: "Karan Rao" })], isAdmin: true };
    wrap(<AuditLogPage />);
    expect(screen.getByLabelText("Record")).toBeInTheDocument();
    expect(screen.getByLabelText("Change")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Person")).getByRole("option", { name: "Karan Rao" })).toBeInTheDocument();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });
});

describe("WebhookForm", () => {
  const initial: ReminderSettingDTO = { enabled: true, url: "https://example.com/hook", method: "POST", headers: [], payloadTemplate: "" } as ReminderSettingDTO;

  it("saves with the extra target and reports back", async () => {
    const setting = { ...initial };
    H.api.put.mockResolvedValue({ setting });
    const onSaved = vi.fn();
    wrap(<WebhookForm initial={initial} defaultTemplate="{}" saveExtra={{ leadId: "l1" }} onSaved={onSaved} />);

    await userEvent.click(screen.getByRole("button", { name: "Add header" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Header 1 name" }), "Authorization");
    await userEvent.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(H.api.put).toHaveBeenCalledWith(
      "/api/reminders/settings",
      expect.objectContaining({ enabled: true, url: "https://example.com/hook", leadId: "l1", headers: [{ key: "Authorization", value: "" }] }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(setting));
    expect(screen.queryByRole("button", { name: "Remove override" })).toBeNull();
  });
});

describe("LoginClient", () => {
  it("signs in as a demo account in demo mode", async () => {
    H.api.get.mockResolvedValue({ firebase: false, demo: true, firebaseConfig: null, allowedDomains: null });
    H.api.post.mockResolvedValue({});
    wrap(<LoginClient />);

    const riya = await screen.findByRole("button", { name: /Riya Nair/ });
    expect(screen.getByRole("button", { name: /Neha Gupta/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/)).toBeNull();

    await userEvent.click(riya);
    expect(H.api.post).toHaveBeenCalledWith("/api/auth/demo", { email: "riya@acme.in" });
    await waitFor(() => expect(H.replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("hides demo accounts the domain whitelist would refuse, and says which domains may sign in", async () => {
    H.api.get.mockResolvedValue({ firebase: false, demo: true, firebaseConfig: null, allowedDomains: "@magickvoice.com" });
    wrap(<LoginClient />);
    expect(await screen.findByText("Demo mode is on")).toBeInTheDocument();
    expect(screen.getByText("@magickvoice.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Riya Nair/ })).toBeNull();
  });

  it("asks for a password and hides demo mode when Firebase is configured", async () => {
    H.api.get.mockResolvedValue({ firebase: true, demo: false, firebaseConfig: {}, allowedDomains: null });
    wrap(<LoginClient />);
    expect(await screen.findByLabelText(/^Password/)).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("type", "text");
    expect(screen.queryByText("Demo mode is on")).toBeNull();
  });
});
