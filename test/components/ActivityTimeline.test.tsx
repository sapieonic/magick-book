// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import type { ActivityDTO } from "@/lib/types";

function act(over: Partial<ActivityDTO>): ActivityDTO {
  return { id: "1", kind: "call", title: "Call logged", detail: "", actorId: "", actorName: "", createdAt: new Date().toISOString(), editedAt: null, ...over };
}

describe("ActivityTimeline", () => {
  it("shows an empty state when there are no activities", () => {
    render(<ActivityTimeline activities={[]} />);
    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
  });

  it("renders a note kind as a 'Note · <author>' comment bubble", () => {
    render(<ActivityTimeline activities={[act({ kind: "note", actorName: "Ada", detail: "Spoke to CFO", title: "Note added" })]} />);
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.getByText("· Ada")).toBeInTheDocument();
    expect(screen.getByText("Spoke to CFO")).toBeInTheDocument();
    // It does NOT render the audit-style "by <author>" line for notes.
    expect(screen.queryByText(/^by Ada$/)).not.toBeInTheDocument();
  });

  it("renders non-note kinds as an audit line with title, detail and 'by <author>'", () => {
    render(<ActivityTimeline activities={[act({ kind: "stage_change", title: "Qualified", detail: "moved", actorName: "Bob" })]} />);
    expect(screen.getByText("Qualified")).toBeInTheDocument();
    expect(screen.getByText("moved")).toBeInTheDocument();
    expect(screen.getByText("by Bob")).toBeInTheDocument();
  });

  it("renders one list item per activity", () => {
    const { container } = render(
      <ActivityTimeline activities={[act({ id: "1" }), act({ id: "2", kind: "note", detail: "n" })]} />,
    );
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("marks an edited note with an 'edited' tag", () => {
    render(<ActivityTimeline activities={[act({ kind: "note", detail: "x", editedAt: new Date().toISOString() })]} />);
    expect(screen.getByText("· edited")).toBeInTheDocument();
  });

  it("shows an edit affordance only for the viewer's own notes", () => {
    const onEdit = vi.fn(async () => {});
    const { rerender } = render(
      <ActivityTimeline activities={[act({ kind: "note", detail: "mine", actorId: "u1" })]} currentUserId="u1" onEdit={onEdit} />,
    );
    expect(screen.getByLabelText("Edit note")).toBeInTheDocument();

    // Someone else's note is not editable.
    rerender(
      <ActivityTimeline activities={[act({ kind: "note", detail: "theirs", actorId: "u2" })]} currentUserId="u1" onEdit={onEdit} />,
    );
    expect(screen.queryByLabelText("Edit note")).not.toBeInTheDocument();
  });

  it("invokes onEdit with the edited text", async () => {
    const onEdit = vi.fn(async () => {});
    render(<ActivityTimeline activities={[act({ id: "n1", kind: "note", detail: "before", actorId: "u1" })]} currentUserId="u1" onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText("Edit note"));
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "after" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).toHaveBeenCalledWith("n1", "after");
  });
});
