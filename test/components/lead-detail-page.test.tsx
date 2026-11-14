// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import type { LeadDetail, LeadDTO } from "@/lib/types";

const H = vi.hoisted(() => ({
  detail: null as unknown,
  role: "admin" as "admin" | "standard",
  refresh: vi.fn(),
  push: vi.fn(),
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: H.push, replace: vi.fn(), prefetch: vi.fn() }) }));

vi.mock("@/components/layout/SessionContext", () => ({
  useSession: () => ({ id: "me", name: "Riya", email: "riya@acme.in", role: H.role, status: "active", authProvider: "demo", workspaceId: "w1", workspaceName: "Acme" }),
}));

vi.mock("@/lib/client", () => ({
  useApi: (url: string | null) => ({
    data: url?.endsWith("/audit") ? { entries: [] } : url?.startsWith("/api/leads/") ? H.detail : null,
    setData: vi.fn(),
    error: null,
    loading: false,
    refresh: H.refresh,
  }),
  api: H.api,
}));

import LeadDetailPage from "@/app/(app)/leads/[id]/page";
import { ZONES, useTimeZone } from "../helpers/timezones";
import type { ReminderDTO } from "@/lib/types";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function lead(over: Partial<LeadDTO> = {}): LeadDTO {
  return {
    id: "l1", name: "Naresh", company: "Shivasakthi group", title: "Director", phone: "+91 98765 43210", email: "naresh@example.com",
    source: "Referral", stage: "qualified", category: "unclassified", estValue: 50000, notes: "", tags: ["pilot"], lostReason: "",
    ownerId: "me", ownerName: "Riya", convertedAccountId: null, order: 0, commentCount: 0, lastActivityAt: ago(120),
    createdAt: ago(130), deletedAt: null, ...over,
  };
}

function detail(over: Partial<LeadDTO> = {}, rest: Partial<LeadDetail> = {}): LeadDetail {
  return {
    lead: lead(over),
    activities: [{ id: "a1", kind: "call", title: "Call logged", detail: "Budget approved for a pilot", actorId: "me", actorName: "Riya", createdAt: ago(120), editedAt: null }],
    stages: [
      { stage: "new", enteredAt: ago(130), leftAt: ago(127) },
      { stage: "contacted", enteredAt: ago(127), leftAt: ago(122) },
      { stage: "qualified", enteredAt: ago(122), leftAt: null },
    ],
    nextStep: null,
    ...rest,
  };
}

/** A promise React's `use()` reads synchronously (already marked fulfilled), so the page never suspends. */
function settled<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: "fulfilled", value });
}

async function renderPage() {
  render(
    <ConfirmProvider>
      <LeadDetailPage params={settled({ id: "l1" })} />
    </ConfirmProvider>,
  );
  await screen.findByRole("region", { name: "Stage track" });
}

beforeEach(() => {
  H.detail = detail();
  H.role = "admin";
  H.refresh.mockReset();
  H.push.mockReset();
  Object.values(H.api).forEach((f) => f.mockReset().mockResolvedValue({}));
});

afterEach(() => {
  vi.useRealTimers();
});

function step(dueAt: string): ReminderDTO {
  return { id: "r1", title: "Send the proposal", notes: "", dueAt, status: "scheduled", leadId: "l1", accountId: null, entityLabel: "Naresh", attempts: 0, sentAt: null, lastError: "", createdAt: ago(1) };
}

describe("Lead detail page", () => {
  it("lays out the hero, stage track, composer, timeline and rail", async () => {
    await renderPage();
    const hero = screen.getByRole("region", { name: "Lead summary" });
    expect(hero).toHaveTextContent("Director, Shivasakthi group");
    expect(hero).toHaveTextContent("₹50,000 estimated");
    expect(within(hero).getByText("4 months ago")).toHaveClass("text-overdue");
    expect(screen.getByRole("button", { current: "step" })).toHaveTextContent("Qualified");
    expect(screen.getByRole("tab", { name: "Call" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Budget approved for a pilot")).toBeInTheDocument();
    expect(screen.getByText(/Nothing logged since/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next step" })).toBeInTheDocument();
    const nextStep = screen.getByRole("heading", { name: "Next step" }).closest("section")!;
    expect(within(nextStep).getByText("Not set")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+91 98765 43210" })).toHaveAttribute("href", "tel:+91 98765 43210");
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
  });

  it("parks the lead through the stage API", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Park" }));
    expect(H.api.patch).toHaveBeenCalledWith("/api/leads/l1/stage", { stage: "parked" });
  });

  it("advances a stage from the track", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: /Proposal/ }));
    expect(H.api.patch).toHaveBeenCalledWith("/api/leads/l1/stage", { stage: "proposal" });
  });

  it("creates the next step as a reminder on the lead", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByLabelText("What happens next"), "Call back about pilot pricing");
    await user.click(screen.getByRole("button", { name: "Save next step" }));
    expect(H.api.post).toHaveBeenCalledWith(
      "/api/reminders",
      expect.objectContaining({ title: "Call back about pilot pricing", leadId: "l1" }),
    );
  });

  it("shows an existing next step with done and reschedule", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T11:00:00+05:30"));
    H.detail = detail({}, { nextStep: step("2026-11-16T12:00:00+05:30") });
    const user = userEvent.setup();
    await renderPage();
    expect(screen.getByText("Send the proposal")).toBeInTheDocument();
    expect(screen.getByText("due in 3 days")).toHaveClass("first-letter:uppercase");
    await user.click(screen.getByRole("button", { name: "Mark done" }));
    expect(H.api.patch).toHaveBeenCalledWith("/api/reminders/r1", { action: "complete" });
  });

  it("calls a step due tomorrow morning 'due tomorrow' in the evening, not 'due today'", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T20:00:00+05:30"));
    H.detail = detail({}, { nextStep: step("2026-11-14T09:00:00+05:30") });
    await renderPage();
    expect(screen.getByText("due tomorrow")).toBeInTheDocument();
  });

  it("marks a step whose time has passed as overdue", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T20:00:00+05:30"));
    H.detail = detail({}, { nextStep: step("2026-11-11T09:00:00+05:30") });
    await renderPage();
    expect(screen.getByText("2 days overdue")).toHaveClass("text-overdue");
  });

  it("defaults a new next step to tomorrow at 9am", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T20:00:00+05:30"));
    await renderPage();
    expect(screen.getByLabelText(/^When/)).toHaveValue("2026-11-14T09:00");
  });

  it("cancels a reschedule without saving", async () => {
    H.detail = detail({}, { nextStep: step(new Date(Date.now() + 3 * DAY).toISOString()) });
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(H.api.patch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mark done" })).toBeInTheDocument();
  });

  it("edits the facts in place", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    const company = screen.getByLabelText("Company");
    await user.clear(company);
    await user.type(company, "Shivasakthi Group Ltd");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(H.api.patch).toHaveBeenCalledWith("/api/leads/l1", expect.objectContaining({ company: "Shivasakthi Group Ltd", tags: ["pilot"], estValue: 50000 }));
  });

  it("cancels editing the facts without saving", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(H.api.patch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit details" })).toBeInTheDocument();
  });

  it("hides edit actions from someone who does not own the lead", async () => {
    H.role = "standard";
    H.detail = detail({ ownerId: "someone-else" });
    await renderPage();
    expect(screen.queryByRole("button", { name: "Edit lead" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive lead" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convert to account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
    for (const b of within(screen.getByRole("region", { name: "Stage track" })).getAllByRole("button")) expect(b).toBeDisabled();
  });

  it("shows an archived lead read-only with a restore action", async () => {
    H.detail = detail({ deletedAt: ago(2) });
    const user = userEvent.setup();
    await renderPage();
    expect(screen.queryByRole("region", { name: "Log activity" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Next step" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore lead" }));
    expect(H.api.patch).toHaveBeenCalledWith("/api/leads/l1", { action: "restore" });
  });

  it("links a converted lead to its account instead of offering conversion", async () => {
    H.detail = detail({ stage: "won", convertedAccountId: "acc1" });
    await renderPage();
    expect(screen.getByRole("link", { name: "View account" })).toHaveAttribute("href", "/accounts/acc1");
    expect(screen.queryByRole("button", { name: "Convert to account" })).not.toBeInTheDocument();
  });
});

// The "When" field holds IST wall-clock time, so a browser outside India fills,
// prefills and submits the same instants as one in Bengaluru.
describe.each(ZONES)("Next step times in IST (browser zone: %s)", (zone) => {
  useTimeZone(zone);
  const when = () => screen.getByLabelText(/^When/);

  it("labels the field IST", async () => {
    await renderPage();
    expect(screen.getByText("IST", { selector: "abbr" })).toHaveAttribute("title", "India Standard Time");
  });

  it("fills 'Tomorrow 9am' with 9:00 on the IST tomorrow and saves 03:30Z", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T02:00:00+05:30")); // still the 13th in London and Los Angeles
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByLabelText("What happens next"), "Call back");
    await user.click(screen.getByRole("button", { name: "Tomorrow 9am" }));
    expect(when()).toHaveValue("2026-11-15T09:00");
    await user.click(screen.getByRole("button", { name: "Save next step" }));
    expect(H.api.post).toHaveBeenCalledWith("/api/reminders", { title: "Call back", dueAt: "2026-11-15T03:30:00.000Z", leadId: "l1" });
  });

  it("submits a typed value as IST", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByLabelText("What happens next"), "Call back");
    fireEvent.change(when(), { target: { value: "2026-11-15T09:00" } });
    await user.click(screen.getByRole("button", { name: "Save next step" }));
    expect(H.api.post).toHaveBeenCalledWith("/api/reminders", expect.objectContaining({ dueAt: "2026-11-15T03:30:00.000Z" }));
  });

  it("prefills a reschedule with the stored time in IST and shows it as IST", async () => {
    H.detail = detail({}, { nextStep: step("2026-11-16T06:30:00.000Z") });
    const user = userEvent.setup();
    await renderPage();
    expect(screen.getByText(/16 Nov 2026, 12:00\s?pm IST/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reschedule" }));
    expect(when()).toHaveValue("2026-11-16T12:00");
    fireEvent.change(when(), { target: { value: "2026-11-17T09:30" } });
    await user.click(screen.getByRole("button", { name: "Save next step" }));
    expect(H.api.patch).toHaveBeenCalledWith("/api/reminders/r1", { action: "snooze", dueAt: "2026-11-17T04:00:00.000Z" });
  });
});
