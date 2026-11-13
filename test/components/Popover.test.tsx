// @vitest-environment jsdom
import { useRef, useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popover } from "@/components/ui/Popover";
import { OverflowMenu } from "@/components/ui/OverflowMenu";

const VIEWPORT = { width: 1000, height: 800 };
const POPOVER = { width: 200, height: 150 };

/** jsdom has no layout: give the trigger a rect and the popover a size. */
function layout(trigger: Partial<DOMRect>) {
  const rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, ...trigger };
  vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue({ ...rect, toJSON: () => rect } as DOMRect);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(POPOVER.width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(POPOVER.height);
}

function Harness() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} onClick={() => setOpen((o) => !o)}>
        Filter
      </button>
      <button>Elsewhere</button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} aria-label="Options" role="dialog">
        <button>First</button>
        <button>Last</button>
      </Popover>
    </>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(VIEWPORT.width);
  window.innerHeight = VIEWPORT.height;
});

describe("Popover placement", () => {
  it("opens under the trigger, aligned to its left edge, in a fixed layer in <body>", async () => {
    layout({ top: 100, bottom: 134, left: 300, right: 400 });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    const pop = screen.getByRole("dialog", { name: "Options" });
    expect(pop.parentElement).toBe(document.body);
    expect(pop).toHaveClass("fixed", "z-40");
    expect(pop.style.top).toBe("140px");
    expect(pop.style.left).toBe("300px");
  });

  it("flips to the trigger's right edge when it would overflow on the right", async () => {
    layout({ top: 100, bottom: 134, left: 900, right: 960 });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.getByRole("dialog").style.left).toBe("760px");
  });

  it("opens upward when it would overflow at the bottom", async () => {
    layout({ top: 700, bottom: 734, left: 20, right: 120 });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.getByRole("dialog").style.top).toBe("544px");
  });

  it("follows the trigger when the page scrolls", async () => {
    layout({ top: 100, bottom: 134, left: 300, right: 400 });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    layout({ top: 40, bottom: 74, left: 300, right: 400 });
    fireEvent.scroll(window);
    expect(screen.getByRole("dialog").style.top).toBe("80px");
  });
});

describe("Popover dismissal", () => {
  it("treats clicks inside the portaled popover as inside, and closes on clicks elsewhere", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("button", { name: "First" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Filter" }));
    screen.getByRole("button", { name: "Last" }).focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveFocus();
  });

  it("closes when Tab leaves either end, continuing from the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Filter" }));
    screen.getByRole("button", { name: "First" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
    await user.tab();
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    screen.getByRole("button", { name: "First" }).focus();
    await user.tab({ shift: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveFocus();
  });
});

describe("OverflowMenu", () => {
  it("focuses the first item, moves with the arrow keys and runs an item with focus back on the button", async () => {
    const user = userEvent.setup();
    const upload = vi.fn();
    const archive = vi.fn();
    render(
      <OverflowMenu
        label="More account actions"
        items={[
          { label: "Upload document", onSelect: upload },
          { label: "Archive account", onSelect: archive, danger: true },
        ]}
      />,
    );
    const button = screen.getByRole("button", { name: "More account actions" });
    await user.click(button);
    const menu = screen.getByRole("menu", { name: "More account actions" });
    expect(menu.parentElement).toBe(document.body);
    expect(button).toHaveAttribute("aria-controls", menu.id);
    expect(screen.getByRole("menuitem", { name: "Upload document" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Archive account" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Upload document" })).toHaveFocus();
    await user.keyboard("{ArrowUp}{Enter}");
    expect(archive).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });
});
