// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "@/components/ui/Misc";

describe("Card", () => {
  it("renders children with default classes", () => {
    const { container } = render(<Card>Default Content</Card>);
    expect(screen.getByText("Default Content")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("border-line");
    expect(container.firstChild).toHaveClass("shadow-[var(--shadow-card)]");
  });

  it("applies premium styling classes when premium prop is true", () => {
    const { container } = render(<Card premium>Premium Content</Card>);
    expect(screen.getByText("Premium Content")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("backdrop-blur-sm");
    // Should not have the standard shadow
    expect(container.firstChild).not.toHaveClass("shadow-[var(--shadow-card)]");
  });

  it("forwards custom className and inline style props", () => {
    const { container } = render(
      <Card className="custom-test-class" style={{ animationDelay: "200ms" }}>
        Styled Content
      </Card>
    );
    expect(container.firstChild).toHaveClass("custom-test-class");
    expect((container.firstChild as HTMLElement).style.animationDelay).toBe("200ms");
  });
});
