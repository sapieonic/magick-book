// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Badge, StatusPill, Tag } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Money, formatMoney, moneyParts } from "@/components/ui/Money";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tabs } from "@/components/ui/Tabs";
import { Table, Th, Td, TwoLine } from "@/components/ui/Table";
import { Panel } from "@/components/ui/Panel";
import { Modal, Drawer } from "@/components/ui/Overlay";
import { STAGE_RAMP, stageColor, stageStep } from "@/components/ui/stage";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe("Badge", () => {
  it("renders children with the tone's classes", () => {
    const { container } = render(<Badge tone="paid">Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("text-paid", "bg-paid-tint");
  });
  it("maps pre-Daybook tone names onto the new tones", () => {
    const { container } = render(<Badge tone="danger">Late</Badge>);
    expect(container.firstChild).toHaveClass("text-overdue");
  });
  it("prefers an explicit tint over tone", () => {
    const { container } = render(<Badge tint="custom-tint" tone="overdue">X</Badge>);
    expect(container.firstChild).toHaveClass("custom-tint");
    expect(container.firstChild).not.toHaveClass("text-overdue");
  });
  it("renders a dot in the given colour", () => {
    const { container } = render(<Badge dot="rgb(1, 2, 3)">X</Badge>);
    expect((container.querySelector("span[style]") as HTMLElement).style.background).toBe("rgb(1, 2, 3)");
  });
  it("Tag renders an outline label", () => {
    render(<Tag>collections</Tag>);
    expect(screen.getByText("collections")).toHaveClass("border-line-strong");
  });
});

describe("StatusPill", () => {
  const shape = (c: HTMLElement) => c.querySelector("[aria-hidden]") as HTMLElement;

  it("labels a domain status and pairs each tone with its own shape", () => {
    const paid = render(<StatusPill status="paid" />);
    expect(paid.getByText("Paid")).toHaveClass("text-paid");
    expect(shape(paid.container)).toHaveClass("rounded-full", "bg-paid-fill"); // dot

    const sent = render(<StatusPill status="sent" />);
    expect(sent.getByText("Sent")).toHaveClass("text-due");
    expect(shape(sent.container)).toHaveClass("rounded-full", "border-due"); // ring
    expect(shape(sent.container)).not.toHaveClass("bg-paid-fill");

    const overdue = render(<StatusPill status="overdue" />);
    expect(overdue.getByText("Overdue")).toHaveClass("text-overdue");
    expect(shape(overdue.container)).toHaveClass("bg-overdue-fill"); // square
    expect(shape(overdue.container)).not.toHaveClass("rounded-full");

    const lost = render(<StatusPill status="lost" />);
    expect(shape(lost.container)).toHaveClass("h-0.5", "w-2"); // dash
  });
  it("accepts a bare tone with custom children", () => {
    render(<StatusPill tone="overdue">70 days overdue</StatusPill>);
    expect(screen.getByText("70 days overdue")).toHaveClass("bg-overdue-tint");
  });
});

describe("Avatar", () => {
  it("renders initials, neutral by default and ink for the signed-in user", () => {
    const { rerender } = render(<Avatar name="Priya Sharma" />);
    expect(screen.getByText("PS")).toHaveClass("bg-sunk");
    rerender(<Avatar name="Priya Sharma" tone="ink" size={40} />);
    expect(screen.getByText("PS")).toHaveClass("bg-ink-1", "text-on-ink");
    expect(screen.getByText("PS").style.width).toBe("40px");
  });
  it('falls back to "?" for an empty name', () => {
    render(<Avatar name="" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("draws the primary action in solid ink", () => {
    render(<Button variant="primary">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("bg-ink-1", "text-on-ink");
  });
  it("defaults to the glass secondary at the 34px control height", () => {
    render(<Button>Mark paid</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-control", "h-[34px]");
  });
  it("is disabled, busy and shows a spinner while loading", () => {
    const { container } = render(<Button loading>Save</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });
  it("respects an explicit disabled prop", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
  it("buttonClasses styles non-button elements and merges overrides", () => {
    const cls = buttonClasses({ variant: "danger", size: "sm", className: "px-9" });
    expect(cls).toContain("text-overdue");
    expect(cls).toContain("h-7");
    expect(cls).toContain("px-9");
    expect(cls).not.toContain("px-2.5");
  });
});

describe("Field / Input / Select / Textarea", () => {
  it("wires the label to its control and shows the required marker", () => {
    render(
      <Field label="Email" required>
        <Input placeholder="you@x.com" />
      </Field>,
    );
    expect(screen.getByLabelText(/Email/)).toBe(screen.getByPlaceholderText("you@x.com"));
    expect(screen.getByText("*")).toBeInTheDocument();
  });
  it("keeps an explicit id and flags the control invalid alongside the error", () => {
    render(
      <Field label="Phone" error="Required field">
        <Input id="phone" />
      </Field>,
    );
    const input = screen.getByLabelText("Phone");
    expect(input).toHaveAttribute("id", "phone");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Required field")).toBeInTheDocument();
  });
  it("labels Select and Textarea too", () => {
    render(
      <>
        <Field label="Source">
          <Select defaultValue="b">
            <option value="a">A</option>
            <option value="b">B</option>
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea defaultValue="hello" />
        </Field>
      </>,
    );
    expect(screen.getByLabelText("Source")).toHaveValue("b");
    expect(screen.getByLabelText("Notes")).toHaveValue("hello");
  });
  it("Input forwards props", () => {
    render(<Input aria-label="amount" value="5" readOnly />);
    expect(screen.getByLabelText("amount")).toHaveValue("5");
  });
});

describe("Money", () => {
  it("splits full amounts with Indian digit grouping", () => {
    expect(moneyParts(437096)).toEqual({ sign: "", digits: "4,37,096" });
    expect(formatMoney(2273557)).toBe("₹22,73,557");
  });
  it("abbreviates to thousand / lakh / crore when compact", () => {
    expect(formatMoney(50000, true)).toBe("₹50k");
    expect(formatMoney(1280000, true)).toBe("₹12.8L");
    expect(formatMoney(26500000, true)).toBe("₹2.6Cr");
    expect(formatMoney(420, true)).toBe("₹420");
  });
  it("shows zero, missing and non-finite values as a dash", () => {
    for (const v of [0, 0.4, null, undefined, NaN, Infinity]) {
      expect(moneyParts(v)).toBeNull();
      expect(formatMoney(v)).toBe("–");
    }
  });
  it("keeps the sign outside the rupee symbol for negatives, compact included", () => {
    expect(formatMoney(-1500)).toBe("−₹1,500");
    expect(formatMoney(-250000, true)).toBe("−₹2.5L");
  });
  it("renders tabular digits with a muted ₹", () => {
    const { container } = render(<Money value={437096} />);
    expect(container.firstChild).toHaveClass("tnum");
    expect(container.firstChild).toHaveTextContent("₹4,37,096");
    expect(screen.getByText("₹")).toHaveClass("opacity-70");
  });
  it("renders a muted dash for zero", () => {
    const { container } = render(<Money value={0} compact />);
    expect(container.firstChild).toHaveTextContent("–");
    expect(container.firstChild).toHaveClass("text-ink-3");
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "board", label: "Board" },
    { value: "table", label: "Table" },
    { value: "lost", label: "Lost" },
  ];

  it("exposes a radio group with the current value checked", () => {
    render(<SegmentedControl aria-label="View" options={options} value="table" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Table" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Board" })).not.toBeChecked();
  });
  it("changes on click and wraps with the arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="View" options={options} value="lost" onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: "Board" }));
    expect(onChange).toHaveBeenLastCalledWith("board");
    screen.getByRole("radio", { name: "Lost" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("board");
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("table");
  });
});

describe("Tabs", () => {
  it("renders route tabs as links with the active one marked current", () => {
    render(
      <Tabs
        aria-label="Account sections"
        value="invoices"
        tabs={[
          { key: "overview", label: "Overview", href: "/a/1" },
          { key: "invoices", label: "Invoices", count: 7, href: "/a/1?tab=invoices" },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Account sections" })).toBeInTheDocument();
    const active = screen.getByRole("link", { name: "Invoices 7" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveAttribute("href", "/a/1?tab=invoices");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
  it("renders state tabs as a tablist driven by click and arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Tabs
        aria-label="Sections"
        value="a"
        onChange={onChange}
        tabs={[{ key: "a", label: "Alpha" }, { key: "b", label: "Beta" }]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Beta" }));
    expect(onChange).toHaveBeenLastCalledWith("b");
    screen.getByRole("tab", { name: "Alpha" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("b"); // wraps from first to last
  });
});

describe("Table", () => {
  it("right-aligns numeric cells and can drop a column on phones", () => {
    render(
      <Table maxHeight={200}>
        <thead>
          <tr><Th>Invoice</Th><Th numeric>Amount</Th><Th hideOnPhone>Owner</Th></tr>
        </thead>
        <tbody>
          <tr>
            <Td><TwoLine primary="#1023" secondary="Samarthya" phoneOnly /></Td>
            <Td numeric>₹4,37,096</Td>
            <Td hideOnPhone>Pooja</Td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByRole("table")).toHaveClass("ledger", "ledger-sticky");
    expect(screen.getByRole("columnheader", { name: "Amount" })).toHaveClass("num");
    expect(screen.getByRole("cell", { name: "₹4,37,096" })).toHaveClass("num");
    expect(screen.getByRole("cell", { name: "Pooja" })).toHaveClass("max-md:hidden");
    expect(screen.getByText("Samarthya")).toHaveClass("md:hidden");
  });
});

describe("Panel", () => {
  it("renders a glass section with title, meta and actions", () => {
    render(
      <Panel title="Work queue" meta={6} actions={<a href="#">Open</a>} aria-label="Queue">
        body
      </Panel>,
    );
    expect(screen.getByRole("region", { name: "Queue" })).toHaveClass("glass", "rounded-panel");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Work queue 6");
    expect(screen.getByRole("link", { name: "Open" })).toBeInTheDocument();
  });
  it("omits the header when there is no title or actions", () => {
    render(<Panel>just body</Panel>);
    expect(screen.queryByRole("heading")).toBeNull();
  });
});

describe("stage ramp", () => {
  it("maps pipeline stages to the 5-step ramp and everything else to grey", () => {
    expect(STAGE_RAMP).toHaveLength(5);
    expect(stageStep("new")).toBe(1);
    expect(stageColor("new")).toBe("var(--color-stage-1)");
    expect(stageColor("won")).toBe("var(--color-stage-5)");
    expect(stageStep("parked")).toBe(0);
    expect(stageColor("lost")).toBe("var(--color-lost-fill)");
  });
});

describe("Modal / Drawer", () => {
  it("renders nothing when closed", () => {
    render(<Modal open={false} onClose={() => {}} title="Hidden">x</Modal>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("is a labelled dialog that closes on Escape and on the close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="New invoice">body</Modal>);
    expect(screen.getByRole("dialog", { name: "New invoice" })).toHaveAttribute("aria-modal", "true");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("traps Tab inside the dialog and restores focus when it closes", async () => {
    const user = userEvent.setup();
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button>Outside</button>
          <Drawer open={open} onClose={() => {}} title="Add lead">
            <input aria-label="Name" />
            <button>Save</button>
          </Drawer>
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    screen.getByRole("button", { name: "Outside" }).focus();
    rerender(<Harness open />);
    expect(screen.getByRole("dialog", { name: "Add lead" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await user.tab(); // wraps to the first control instead of leaving the dialog
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();

    rerender(<Harness open={false} />);
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
  });
  it("only the topmost dialog answers Escape", async () => {
    const user = userEvent.setup();
    const closeLower = vi.fn();
    const closeUpper = vi.fn();
    render(
      <>
        <Drawer open onClose={closeLower} title="Lower">a</Drawer>
        <Modal open onClose={closeUpper} title="Upper">b</Modal>
      </>,
    );
    await user.keyboard("{Escape}");
    expect(closeUpper).toHaveBeenCalledTimes(1);
    expect(closeLower).not.toHaveBeenCalled();
  });
});
