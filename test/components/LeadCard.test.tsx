// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeadCard, LeadRow } from "@/components/leads/LeadCard";
import type { LeadDTO } from "@/lib/types";

function lead(over: Partial<LeadDTO>): LeadDTO {
  return {
    id: "1",
    name: "Priya Sharma",
    company: "Lumen Retail",
    title: "",
    phone: "",
    email: "",
    source: "Website",
    stage: "new",
    category: "unclassified",
    estValue: 0,
    notes: "",
    tags: [],
    lostReason: "",
    ownerId: "o1",
    ownerName: "Asha Owner",
    convertedAccountId: null,
    order: 0,
    commentCount: 0,
    lastActivityAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    deletedAt: null,
    ...over,
  };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("LeadCard", () => {
  it("links the name to the lead and shows the company", () => {
    render(<LeadCard lead={lead({})} />);
    expect(screen.getByRole("link", { name: "Priya Sharma" })).toHaveAttribute("href", "/leads/1");
    expect(screen.getByText("Lumen Retail")).toBeInTheDocument();
  });

  it("renders a compact value and tags", () => {
    render(<LeadCard lead={lead({ estValue: 420000, tags: ["hot", "warm"] })} />);
    expect(screen.getByText("4.2L", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("hot")).toBeInTheDocument();
    expect(screen.getByText("warm")).toBeInTheDocument();
  });

  it("shows a dash, never a rupee zero, when there is no value", () => {
    const { container } = render(<LeadCard lead={lead({ estValue: 0 })} />);
    expect(container.textContent).not.toContain("₹");
    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("renders the owner initials with a title", () => {
    render(<LeadCard lead={lead({ ownerName: "Asha Owner" })} />);
    expect(screen.getByTitle("Asha Owner")).toHaveTextContent("AO");
  });

  it("writes the category as text with the note count", () => {
    render(<LeadCard lead={lead({ category: "finance", commentCount: 3 })} />);
    expect(screen.getByText("Finance · 3 notes")).toBeInTheDocument();
  });

  it("singularises the note count and hides Unclassified", () => {
    render(<LeadCard lead={lead({ category: "unclassified", commentCount: 1 })} />);
    expect(screen.getByText("1 note")).toBeInTheDocument();
    expect(screen.queryByText(/Unclassified/)).not.toBeInTheDocument();
  });

  it("writes staleness in words and turns it overdue past 30 days", () => {
    const { rerender } = render(<LeadCard lead={lead({ lastActivityAt: daysAgo(17) })} />);
    expect(screen.getByText("17 days")).not.toHaveClass("text-overdue");

    rerender(<LeadCard lead={lead({ lastActivityAt: daysAgo(125) })} />);
    expect(screen.getByText("4 months")).toHaveClass("text-overdue");
  });

  it("renders without a link while dragging", () => {
    render(<LeadCard lead={lead({})} dragging />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
  });
});

describe("LeadRow (Won)", () => {
  it("links to the account a converted lead became", () => {
    render(<LeadRow lead={lead({ stage: "won", convertedAccountId: "acc1", estValue: 500000 })} />);
    expect(screen.getByRole("link", { name: "View account" })).toHaveAttribute("href", "/accounts/acc1");
    expect(screen.getByText("5L", { exact: false })).toBeInTheDocument();
  });

  it("omits the account link when the lead was not converted, and never colours its age", () => {
    render(<LeadRow lead={lead({ stage: "won", lastActivityAt: daysAgo(90) })} />);
    expect(screen.queryByRole("link", { name: "View account" })).not.toBeInTheDocument();
    expect(screen.getByText("3 months")).not.toHaveClass("text-overdue");
  });
});
