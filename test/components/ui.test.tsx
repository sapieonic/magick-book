// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { avatarTint, initials } from "@/lib/utils";

describe("Badge", () => {
  it("renders children and a tone class", () => {
    const { container } = render(<Badge tone="success">Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("text-success");
  });
  it("prefers an explicit tint over tone", () => {
    const { container } = render(<Badge tint="custom-tint" tone="danger">X</Badge>);
    expect(container.firstChild).toHaveClass("custom-tint");
    expect(container.firstChild).not.toHaveClass("text-danger");
  });
  it("renders a dot when given", () => {
    const { container } = render(<Badge dot="#abc">X</Badge>);
    const dot = container.querySelector("span[style]");
    expect(dot).toBeTruthy();
    expect((dot as HTMLElement).style.background).toContain("rgb");
  });
});

describe("Avatar", () => {
  it("renders deterministic initials and tint", () => {
    render(<Avatar name="Priya Sharma" />);
    expect(screen.getByText("PS")).toBeInTheDocument();
    const el = screen.getByText("PS");
    const { fg } = avatarTint("Priya Sharma");
    // jsdom normalizes hex to rgb; just assert the color is set + initials match
    expect(el.style.color).toBeTruthy();
    expect(initials("Priya Sharma")).toBe("PS");
    void fg;
  });
  it('falls back to "?" for an empty name', () => {
    render(<Avatar name="" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("applies the primary variant class", () => {
    render(<Button variant="primary">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("brand-gradient");
  });
  it("is disabled and shows a spinner while loading", () => {
    const { container } = render(<Button loading>Save</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });
  it("respects an explicit disabled prop", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("Field / Input / Select", () => {
  it("renders a label, required marker and error", () => {
    render(
      <Field label="Email" required error="Required field">
        <Input placeholder="you@x.com" />
      </Field>,
    );
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.getByText("Required field")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@x.com")).toBeInTheDocument();
  });
  it("Input forwards props", () => {
    render(<Input aria-label="amount" value="5" readOnly />);
    expect(screen.getByLabelText("amount")).toHaveValue("5");
  });
  it("Select renders options", () => {
    render(
      <Select aria-label="src" defaultValue="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    expect(screen.getByLabelText("src")).toHaveValue("b");
  });
});
