// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DatedList, EmptyState, ErrorState, KbdHint, Logo, RowsSkeleton, Skeleton } from "@/components/ui/Misc";

describe("EmptyState / ErrorState / Skeleton / Logo / KbdHint", () => {
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

  it("Logo is a decorative token-coloured mark beside the wordmark, with no bitmap", () => {
    const { container } = render(<Logo />);
    expect(container).toHaveTextContent("MagickBook");
    expect(container.querySelector("img")).toBeNull();
    const mark = container.querySelector("svg");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveClass("text-accent");
  });

  it("KbdHint renders a kbd element", () => {
    render(<KbdHint>⌘K</KbdHint>);
    expect(screen.getByText("⌘K").tagName).toBe("KBD");
  });
});

describe("RowsSkeleton / DatedList", () => {
  it("RowsSkeleton is a labelled busy placeholder with the requested rows", () => {
    render(<RowsSkeleton rows={3} label="Loading invoices" />);
    const box = screen.getByLabelText("Loading invoices");
    expect(box).toHaveAttribute("aria-busy", "true");
    expect(box.children).toHaveLength(3);
  });

  it("DatedList lists dated rows, or the empty line", () => {
    const { rerender } = render(<DatedList items={[{ key: "a", date: "3 Nov", text: "Called Ashish" }]} empty="Nothing yet" />);
    expect(screen.getByRole("listitem")).toHaveTextContent("3 NovCalled Ashish");
    rerender(<DatedList items={[]} empty="Nothing yet" />);
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });
});
