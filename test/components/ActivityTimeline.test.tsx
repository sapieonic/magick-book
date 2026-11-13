// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { MEETING_TITLE } from "@/lib/constants";
import type { ActivityDTO } from "@/lib/types";

function act(over: Partial<ActivityDTO>): ActivityDTO {
  return { id: "1", kind: "call", title: "Call logged", detail: "", actorId: "", actorName: "", createdAt: "2026-07-16T10:00:00.000Z", editedAt: null, ...over };
}

describe("ActivityTimeline", () => {
  it("shows an empty state when there are no activities", () => {
    render(<ActivityTimeline activities={[]} />);
    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
  });

  it("renders a note as kind, text, then the author", () => {
    render(<ActivityTimeline activities={[act({ kind: "note", actorName: "Ada", detail: "Spoke to CFO", title: "Note added" })]} />);
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.getByText("Spoke to CFO")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("labels a note stored with the meeting title as a Meeting", () => {
    render(<ActivityTimeline activities={[act({ kind: "note", title: MEETING_TITLE, detail: "Met the finance head" })]} />);
    expect(screen.getByText("Meeting")).toBeInTheDocument();
    expect(screen.queryByText("Note")).not.toBeInTheDocument();
  });

  it("renders system kinds with their title and detail", () => {
    render(<ActivityTimeline activities={[act({ kind: "stage_change", title: "Qualified", detail: "moved", actorName: "Bob" })]} />);
    expect(screen.getByText("Stage")).toBeInTheDocument();
    expect(screen.getByText("Qualified")).toBeInTheDocument();
    expect(screen.getByText(/moved/)).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("groups entries under a heading per month", () => {
    render(
      <ActivityTimeline
        activities={[
          act({ id: "1", createdAt: "2026-11-02T10:00:00.000Z", detail: "Nov call" }),
          act({ id: "2", createdAt: "2026-07-14T10:00:00.000Z", detail: "Jul call A" }),
          act({ id: "3", createdAt: "2026-07-08T10:00:00.000Z", detail: "Jul call B" }),
        ]}
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["November 2026", "July 2026"]);
    const july = screen.getByRole("region", { name: "July 2026" });
    expect(within(july).getAllByRole("listitem")).toHaveLength(2);
  });

  it("collapses older entries behind a 'Show earlier' button", () => {
    const many = Array.from({ length: 5 }, (_, i) => act({ id: String(i), detail: `call ${i}` }));
    render(<ActivityTimeline activities={many} collapseAfter={3} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Show 2 earlier entries" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("marks an edited note", () => {
    render(<ActivityTimeline activities={[act({ kind: "note", detail: "x", actorName: "Ada", editedAt: new Date().toISOString() })]} />);
    expect(screen.getByText("Ada · edited")).toBeInTheDocument();
  });

  it("shows an edit affordance only for the viewer's own notes", () => {
    const onEdit = vi.fn(async () => {});
    const { rerender } = render(
      <ActivityTimeline activities={[act({ kind: "note", detail: "mine", actorId: "u1" })]} currentUserId="u1" onEdit={onEdit} />,
    );
    expect(screen.getByRole("button", { name: "Edit note" })).toBeInTheDocument();

    // Someone else's note is not editable, nor is a call the viewer logged.
    rerender(
      <ActivityTimeline
        activities={[act({ id: "a", kind: "note", detail: "theirs", actorId: "u2" }), act({ id: "b", kind: "call", detail: "my call", actorId: "u1" })]}
        currentUserId="u1"
        onEdit={onEdit}
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit note" })).not.toBeInTheDocument();
  });

  it("invokes onEdit with the edited text and closes the editor", async () => {
    const onEdit = vi.fn(async () => {});
    render(<ActivityTimeline activities={[act({ id: "n1", kind: "note", detail: "before", actorId: "u1" })]} currentUserId="u1" onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "after" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).toHaveBeenCalledWith("n1", "after");
    expect(await screen.findByRole("button", { name: "Edit note" })).toBeInTheDocument();
  });

  it("keeps the editor open when saving fails", async () => {
    const onEdit = vi.fn(async () => {
      throw new Error("nope");
    });
    render(<ActivityTimeline activities={[act({ id: "n1", kind: "note", detail: "before", actorId: "u1" })]} currentUserId="u1" onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(onEdit).toHaveBeenCalled());
    expect(screen.getByRole("textbox", { name: "Note" })).toBeInTheDocument();
  });
});
