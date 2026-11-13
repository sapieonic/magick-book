// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Card, EmptyState, ErrorState, KbdHint, Skeleton } from "@/components/ui/Misc";

describe("Card", () => {
  it("renders children on a glass panel surface", () => {
    const { container } = render(<Card>Default Content</Card>);
    expect(screen.getByText("Default Content")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("glass", "rounded-panel");
  });

  it("forwards custom className and inline style props", () => {
    const { container } = render(
      <Card className="custom-test-class" style={{ animationDelay: "200ms" }}>
        Styled Content
      </Card>,
    );
    expect(container.firstChild).toHaveClass("custom-test-class");
    expect((container.firstChild as HTMLElement).style.animationDelay).toBe("200ms");
  });
});

describe("EmptyState / ErrorState / Skeleton / KbdHint", () => {
  it("EmptyState shows its title, description and action", () => {
    render(<EmptyState title="No leads yet" description="Add your first lead." action={<button>Add lead</button>} />);
    expect(screen.getByRole("heading", { name: "No leads yet" })).toBeInTheDocument();
    expect(screen.getByText("Add your first lead.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add lead" })).toBeInTheDocument();
  });

  it("ErrorState announces the message and retries", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Failed to load" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("Skeleton is decorative", () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    expect(container.firstChild).toHaveClass("skeleton", "h-4");
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("KbdHint renders a kbd element", () => {
    render(<KbdHint>⌘K</KbdHint>);
    expect(screen.getByText("⌘K").tagName).toBe("KBD");
  });
});
