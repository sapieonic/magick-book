// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OwnerFilter, type OwnerOption } from "@/components/leads/OwnerFilter";

const owners: OwnerOption[] = [
  { id: "a", name: "Amit", count: 2 },
  { id: "b", name: "Bela", count: 1 },
  { id: "me", name: "Riya", count: 3 },
];

function renderFilter(props: Partial<React.ComponentProps<typeof OwnerFilter>> = {}) {
  const onChange = vi.fn();
  render(<OwnerFilter owners={owners} value={[]} onChange={onChange} {...props} />);
  return { onChange };
}

beforeEach(() => vi.clearAllMocks());

describe("OwnerFilter", () => {
  it("opens and closes the popover, toggling aria-expanded", async () => {
    const user = userEvent.setup();
    renderFilter();
    const trigger = screen.getByRole("button", { name: /Owner/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("lists every owner with their lead count", async () => {
    const user = userEvent.setup();
    renderFilter();
    await user.click(screen.getByRole("button", { name: /Owner/i }));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(screen.getByRole("option", { name: /Amit/ })).toHaveTextContent("2");
  });

  it("adds an owner to the selection when an option is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ value: [] });
    await user.click(screen.getByRole("button", { name: /Owner/i }));
    await user.click(screen.getByRole("option", { name: /Bela/ }));
    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("removes an already-selected owner when its option is clicked again", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ value: ["b"] });
    // With one owner selected the trigger is labelled with that owner's name.
    await user.click(screen.getByRole("button", { name: /Bela/ }));
    await user.click(screen.getByRole("option", { name: /Bela/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("filters the option list by the search query", async () => {
    const user = userEvent.setup();
    renderFilter();
    await user.click(screen.getByRole("button", { name: /Owner/i }));
    await user.type(screen.getByPlaceholderText("Filter by owner…"), "am");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Amit/ })).toBeInTheDocument();
  });

  it("shows an empty message when nothing matches the search", async () => {
    const user = userEvent.setup();
    renderFilter();
    await user.click(screen.getByRole("button", { name: /Owner/i }));
    await user.type(screen.getByPlaceholderText("Filter by owner…"), "zzz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/No owners match/)).toBeInTheDocument();
  });

  it("clears the whole selection from the footer", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ value: ["a", "b"] });
    await user.click(screen.getByRole("button", { name: /owners/i }));
    await user.click(screen.getByRole("button", { name: /Clear 2 filters/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("clears the selection from the corner badge without opening the popover", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ value: ["a"] });
    await user.click(screen.getByRole("button", { name: /Clear owner filter/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("offers an 'Only my leads' shortcut that selects the current user", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ currentUserId: "me" });
    await user.click(screen.getByRole("button", { name: /Owner/i }));
    await user.click(screen.getByRole("button", { name: /Only my leads/i }));
    expect(onChange).toHaveBeenCalledWith(["me"]);
  });

  it("hides 'Only my leads' when the current user owns no leads", async () => {
    const user = userEvent.setup();
    renderFilter({ currentUserId: "someone-else" });
    await user.click(screen.getByRole("button", { name: /Owner/i }));
    expect(screen.queryByRole("button", { name: /Only my leads/i })).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderFilter();
    const trigger = screen.getByRole("button", { name: /Owner/i });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("labels the trigger with the single owner's name, or a count for several", () => {
    const { rerender } = render(<OwnerFilter owners={owners} value={["a"]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Amit/ })).toBeInTheDocument();
    rerender(<OwnerFilter owners={owners} value={["a", "b"]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /2 owners/ })).toBeInTheDocument();
  });
});
