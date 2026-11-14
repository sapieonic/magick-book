// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const post = vi.fn(async () => ({}));
vi.mock("@/lib/client", () => ({ api: { post: (...args: unknown[]) => post(...(args as [])) } }));

import { NoteComposer } from "@/components/activity/NoteComposer";

beforeEach(() => post.mockClear());

describe("NoteComposer", () => {
  it("posts a note by default, with no kind tabs", async () => {
    const onAdded = vi.fn();
    render(<NoteComposer postUrl="/api/accounts/a1/activity" onAdded={onAdded} onRemind={vi.fn()} />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Renewal call went well" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/accounts/a1/activity", { kind: "note", detail: "Renewal call went well" });
  });

  it("hints the post shortcut for the platform", () => {
    render(<NoteComposer postUrl="/x" onAdded={vi.fn()} />);
    expect(screen.getByText("Ctrl Enter").tagName).toBe("KBD");
  });

  it("offers kinds as tabs and posts the selected one", async () => {
    render(<NoteComposer postUrl="/api/leads/l1/activities" kinds={["call", "note", "meeting"]} onAdded={vi.fn()} onRemind={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Call" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Meeting" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Meeting notes" }), { target: { value: "Met the finance head" } });
    fireEvent.click(screen.getByRole("button", { name: "Log meeting" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/leads/l1/activities", { kind: "meeting", detail: "Met the finance head" }));
  });

  it("follows a controlled kind", () => {
    render(<NoteComposer postUrl="/x" kinds={["call", "note"]} kind="note" onKindChange={vi.fn()} onAdded={vi.fn()} onRemind={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Note" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Add note" })).toBeInTheDocument();
  });

  it("hands /remind text to onRemind instead of posting", () => {
    const onRemind = vi.fn();
    render(<NoteComposer postUrl="/x" onAdded={vi.fn()} onRemind={onRemind} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "/remind send the proposal" } });
    fireEvent.click(screen.getByRole("button", { name: "Set reminder" }));
    expect(onRemind).toHaveBeenCalledWith("send the proposal");
    expect(post).not.toHaveBeenCalled();
  });
});
