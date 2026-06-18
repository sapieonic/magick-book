// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeadCard } from "@/components/leads/LeadCard";
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

describe("LeadCard", () => {
  it("renders the name and company", () => {
    render(<LeadCard lead={lead({})} />);
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("Lumen Retail")).toBeInTheDocument();
  });

  it("renders a compact value and tags", () => {
    render(<LeadCard lead={lead({ estValue: 420000, tags: ["hot", "warm"] })} />);
    expect(screen.getByText("₹4.2L")).toBeInTheDocument();
    expect(screen.getByText("hot")).toBeInTheDocument();
    expect(screen.getByText("warm")).toBeInTheDocument();
  });

  it("renders the owner initials with a title", () => {
    render(<LeadCard lead={lead({ ownerName: "Asha Owner" })} />);
    expect(screen.getByTitle("Asha Owner")).toHaveTextContent("AO");
  });

  it("flags converted leads in the footer", () => {
    render(<LeadCard lead={lead({ convertedAccountId: "acc1" })} />);
    expect(screen.getByText(/account/i)).toBeInTheDocument();
  });

  it("shows the comment count when there are comments", () => {
    render(<LeadCard lead={lead({ commentCount: 3 })} />);
    expect(screen.getByTitle("3 comments")).toHaveTextContent("3");
  });

  it("singularises the comment count title", () => {
    render(<LeadCard lead={lead({ commentCount: 1 })} />);
    expect(screen.getByTitle("1 comment")).toBeInTheDocument();
  });

  it("omits the comment count when there are none", () => {
    render(<LeadCard lead={lead({ commentCount: 0 })} />);
    expect(screen.queryByTitle(/comment/)).not.toBeInTheDocument();
  });

  it("omits the value/tags row when there is nothing to show", () => {
    const { container } = render(<LeadCard lead={lead({ estValue: 0, tags: [], convertedAccountId: null })} />);
    expect(container.textContent).not.toContain("₹");
  });
});
