// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZONES, useTimeZone } from "../helpers/timezones";

const H = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/client", () => ({ api: { post: H.post } }));

import { ReminderModal } from "@/components/reminders/ReminderModal";

beforeEach(() => {
  H.post.mockReset().mockResolvedValue({ reminder: { id: "r1" } });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderModal() {
  render(<ReminderModal open onClose={vi.fn()} leadId="l1" initialTitle="Chase the PO" />);
  return screen.getByLabelText(/^When/);
}

// The "When" field holds IST wall-clock time whatever the browser's zone.
describe.each(ZONES)("Reminder modal times in IST (browser zone: %s)", (zone) => {
  useTimeZone(zone);

  it("defaults to an hour from now, in IST", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T23:30:00+05:30"));
    expect(renderModal()).toHaveValue("2026-11-15T00:30");
    expect(screen.getByText("IST", { selector: "abbr" })).toHaveAttribute("title", "India Standard Time");
  });

  it("fills the presets in IST and submits them as IST", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T02:00:00+05:30")); // still the 13th in London and Los Angeles
    const user = userEvent.setup();
    const when = renderModal();
    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(when).toHaveValue("2026-11-21T09:00");
    await user.click(screen.getByRole("button", { name: "Tomorrow 9am" }));
    expect(when).toHaveValue("2026-11-15T09:00");
    await user.click(screen.getByRole("button", { name: "Set reminder" }));
    expect(H.post).toHaveBeenCalledWith("/api/reminders", expect.objectContaining({ title: "Chase the PO", dueAt: "2026-11-15T03:30:00.000Z", leadId: "l1" }));
  });

  it("submits a typed value as IST and refuses an empty one", async () => {
    const user = userEvent.setup();
    const when = renderModal();
    fireEvent.change(when, { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Set reminder" }));
    expect(H.post).not.toHaveBeenCalled();
    fireEvent.change(when, { target: { value: "2026-11-15T09:00" } });
    await user.click(screen.getByRole("button", { name: "Set reminder" }));
    expect(H.post).toHaveBeenCalledWith("/api/reminders", expect.objectContaining({ dueAt: "2026-11-15T03:30:00.000Z" }));
  });
});
