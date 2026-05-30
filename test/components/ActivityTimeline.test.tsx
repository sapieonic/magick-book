// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import type { ActivityDTO } from "@/lib/types";

function act(over: Partial<ActivityDTO>): ActivityDTO {
  return { id: "1", kind: "call", title: "Call logged", detail: "", actorName: "", createdAt: new Date().toISOString(), ...over };
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
});
