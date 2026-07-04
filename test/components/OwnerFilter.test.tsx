// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OwnerFilter, type OwnerOption } from "@/components/leads/OwnerFilter";

const owners: OwnerOption[] = [
  { id: "a", name: "Amit", count: 2 },
  { id: "b", name: "Bela", count: 1 },
  { id: "me", name: "Riya", count: 3 },
];

function renderFilter(props: Partial<React.ComponentProps<typeof OwnerFilter>> = {}) {
  const onChange = vi.fn();
  const utils = render(<OwnerFilter owners={owners} value={[]} onChange={onChange} {...props} />);
  return { onChange, ...utils };
}

// The trigger is the button that owns the popover (aria-haspopup="listbox").
function trigger() {
  return screen.getAllByRole("button").find((b) => b.getAttribute("aria-haspopup") === "listbox")!;
}
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(trigger());
}

beforeEach(() => vi.clearAllMocks());

describe("OwnerFilter — trigger", () => {
  it("shows the default 'Owner' label and inactive state when nothing is selected", () => {
    renderFilter();
    const btn = trigger();
    expect(btn).toHaveTextContent("Owner");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn.className).toContain("border-line");
    expect(btn.className).not.toContain("border-violet-400");
  });

  it("switches to the active style when a filter is applied", () => {
    renderFilter({ value: ["a"] });
    expect(trigger().className).toContain("border-violet-400");
  });

  it("labels the trigger with the single owner's name when exactly one is selected", () => {
    renderFilter({ value: ["a"] });
    expect(trigger()).toHaveTextContent("Amit");
  });

  it("labels the trigger with a pluralized count when several are selected", () => {
    renderFilter({ value: ["a", "b"] });
    expect(trigger()).toHaveTextContent("2 owners");
  });

  it("falls back to a count label when the selected id is not a known owner", () => {
    renderFilter({ value: ["ghost"] });
    // No matching owner to name, so it shows the honest count instead of a name.
    expect(trigger()).toHaveTextContent("1 owner");
    expect(trigger()).not.toHaveTextContent("Amit");
  });

  it("does not render the clear badge when nothing is selected", () => {
    renderFilter();
    expect(screen.queryByRole("button", { name: /Clear owner filter/i })).not.toBeInTheDocument();
  });
});

describe("OwnerFilter — popover open/close", () => {
  it("opens on click and exposes a multi-selectable listbox", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const box = screen.getByRole("listbox");
    expect(box).toHaveAttribute("aria-multiselectable");
    expect(trigger().getAttribute("aria-controls")).toBe(box.id);
  });

  it("toggles closed on a second trigger click", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    await user.click(trigger());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Escape and restores aria-expanded", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on an outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button>outside</button>
        <OwnerFilter owners={owners} value={[]} onChange={vi.fn()} />
      </div>,
    );
    await user.click(trigger());
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("stays open after toggling an option (multi-select workflow)", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    await user.click(screen.getByRole("option", { name: /Amit/ }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("focuses the search box when opened", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    expect(screen.getByPlaceholderText("Filter by owner…")).toHaveFocus();
  });

  it("resets the search query when reopened", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    await user.type(screen.getByPlaceholderText("Filter by owner…"), "am");
    await user.keyboard("{Escape}");
    await open(user);
    expect(screen.getByPlaceholderText("Filter by owner…")).toHaveValue("");
  });
});

describe("OwnerFilter — option list", () => {
  it("lists every owner sorted as provided, with per-owner counts and avatars", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Amit"),
      expect.stringContaining("Bela"),
      expect.stringContaining("Riya"),
    ]);
    expect(within(options[0]).getByText("2")).toBeInTheDocument();
  });

  it("marks selected options with aria-selected and a check indicator", async () => {
    const user = userEvent.setup();
    renderFilter({ value: ["b"] });
    await open(user);
    expect(screen.getByRole("option", { name: /Amit/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("option", { name: /Bela/ })).toHaveAttribute("aria-selected", "true");
  });
});

describe("OwnerFilter — selection", () => {
  it("adds an owner when an unselected option is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ value: [] });
    await open(user);
    await user.click(screen.getByRole("option", { name: /Bela/ }));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("appends to an existing selection (multi-select)", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ value: ["a"] });
    await open(user);
    await user.click(screen.getByRole("option", { name: /Bela/ }));
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("removes an already-selected owner when its option is clicked again", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ value: ["a", "b"] });
    await open(user);
    await user.click(screen.getByRole("option", { name: /Amit/ }));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });
});

describe("OwnerFilter — search", () => {
  it("filters options by a case-insensitive substring", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    await user.type(screen.getByPlaceholderText("Filter by owner…"), "AM");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Amit/ })).toBeInTheDocument();
  });

  it("shows the empty message echoing the query when nothing matches", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    await user.type(screen.getByPlaceholderText("Filter by owner…"), "zzz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/No owners match .*zzz/)).toBeInTheDocument();
  });

  it("restores the full list when the query is cleared", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    const box = screen.getByPlaceholderText("Filter by owner…");
    await user.type(box, "am");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.clear(box);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });
});

describe("OwnerFilter — clearing", () => {
  it("clears from the corner badge without opening the popover", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ value: ["a"] });
    await user.click(screen.getByRole("button", { name: /Clear owner filter/i }));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clears from the footer with singular wording for one filter", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ value: ["a"] });
    await open(user);
    const clear = screen.getByRole("button", { name: /Clear 1 filter$/i });
    expect(clear).toBeInTheDocument();
    await user.click(clear);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("clears from the footer with plural wording for several filters", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ value: ["a", "b"] });
    await open(user);
    await user.click(screen.getByRole("button", { name: /Clear 2 filters/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("does not render the footer clear button when nothing is selected", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    expect(screen.queryByRole("button", { name: /Clear \d+ filter/i })).not.toBeInTheDocument();
  });
});

describe("OwnerFilter — 'Only my leads' shortcut", () => {
  it("is hidden when no currentUserId is given", async () => {
    const user = userEvent.setup();
    renderFilter();
    await open(user);
    expect(screen.queryByRole("button", { name: /Only my leads/i })).not.toBeInTheDocument();
  });

  it("is hidden when the current user owns no leads in the pool", async () => {
    const user = userEvent.setup();
    renderFilter({ currentUserId: "nobody" });
    await open(user);
    expect(screen.queryByRole("button", { name: /Only my leads/i })).not.toBeInTheDocument();
  });

  it("selects only the current user when clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ currentUserId: "me" });
    await open(user);
    await user.click(screen.getByRole("button", { name: /Only my leads/i }));
    expect(onChange).toHaveBeenCalledWith(["me"]);
  });

  it("toggles back off when the current selection is already 'only me'", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ currentUserId: "me", value: ["me"] });
    await open(user);
    await user.click(screen.getByRole("button", { name: /Only my leads/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("replaces a broader selection with just the current user", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ currentUserId: "me", value: ["a", "me"] });
    await open(user);
    // value is not exactly [me], so it is not considered "mine only" and re-selects me.
    await user.click(screen.getByRole("button", { name: /Only my leads/i }));
    expect(onChange).toHaveBeenCalledWith(["me"]);
  });
});

describe("OwnerFilter — avatar stack overflow", () => {
  it("shows a +N bubble when more than three owners are selected", () => {
    const many: OwnerOption[] = [
      { id: "a", name: "Amit", count: 1 },
      { id: "b", name: "Bela", count: 1 },
      { id: "c", name: "Cara", count: 1 },
      { id: "d", name: "Dev", count: 1 },
    ];
    render(<OwnerFilter owners={many} value={["a", "b", "c", "d"]} onChange={vi.fn()} />);
    expect(trigger()).toHaveTextContent("+1");
    expect(trigger()).toHaveTextContent("4 owners");
  });
});
