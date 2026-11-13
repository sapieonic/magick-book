// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ProportionBar, segmentShares, type Segment } from "@/components/ui/ProportionBar";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const seg = (key: string, value: number, extra: Partial<Segment> = {}): Segment => ({
  key,
  label: key,
  value,
  color: `var(--${key})`,
  ...extra,
});

describe("segmentShares", () => {
  it("computes each segment's share of the total as a fraction and a whole percent", () => {
    const out = segmentShares([seg("new", 110000), seg("contacted", 220000), seg("qualified", 145000), seg("proposal", 0), seg("won", 810000)]);
    expect(out.map((s) => s.pct)).toEqual([9, 17, 11, 0, 63]);
    expect(out.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
    expect(out[4].share).toBeCloseTo(810000 / 1285000);
  });
  it("returns all-zero shares when nothing has value", () => {
    expect(segmentShares([seg("a", 0), seg("b", 0)]).map((s) => [s.share, s.pct])).toEqual([[0, 0], [0, 0]]);
    expect(segmentShares([])).toEqual([]);
  });
  it("treats negative and non-finite values as zero", () => {
    const out = segmentShares([seg("a", -50), seg("b", NaN), seg("c", 200)]);
    expect(out.map((s) => s.value)).toEqual([0, 0, 200]);
    expect(out.map((s) => s.pct)).toEqual([0, 0, 100]);
  });
  it("keeps the caller's extra fields", () => {
    expect(segmentShares([seg("a", 1, { count: 7, href: "/x" })])[0]).toMatchObject({ count: 7, href: "/x", pct: 100 });
  });
});

describe("ProportionBar ribbon", () => {
  const segments = [
    seg("New", 100000, { count: 7, href: "/leads?stage=new" }),
    seg("Proposal", 0, { count: 0 }),
    seg("Won", 300000, { count: 10, note: "10 accounts", valueClassName: "text-paid" }),
  ];

  it("draws each band's width to its value and writes the value on it", () => {
    render(<ProportionBar aria-label="Pipeline by value" segments={segments} />);
    const group = screen.getByRole("group", { name: "Pipeline by value" });
    const band = within(group).getByRole("link", { name: /New/ });
    expect(band).toHaveAttribute("href", "/leads?stage=new");
    expect(band.style.flexGrow).toBe("100000");
    expect(band).toHaveTextContent("₹1L");
    expect(band).toHaveTextContent("25%");
    expect(within(group).getByText("75% · 10 accounts")).toBeInTheDocument();
    expect(group.querySelector(".text-paid")).toHaveTextContent("₹3L");
  });
  it("shows an empty value as a fixed hatched slot with a dash", () => {
    const { container } = render(<ProportionBar aria-label="Pipeline" segments={segments} emptyLabel="Empty stage" />);
    const slot = screen.getByText("Empty stage").parentElement as HTMLElement;
    expect(slot.style.flexGrow).toBe("");
    expect(slot).toHaveClass("grow-0");
    expect(slot).toHaveTextContent("–");
    expect(container.querySelectorAll(".hatch")).toHaveLength(1);
  });
});

describe("ProportionBar bar", () => {
  const aging = [seg("Not yet due", 1020), seg("1–30 days", 1021812), seg("31–60 days", 0), seg("Over 60 days", 18880)];

  it("is one image whose label spells out every amount, drawing only non-zero parts", () => {
    render(<ProportionBar variant="bar" aria-label="Aging" segments={aging} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAccessibleName("Aging: Not yet due ₹1,020, 1–30 days ₹10,21,812, 31–60 days –, Over 60 days ₹18,880");
    expect(img.children).toHaveLength(3);
    expect((img.children[1] as HTMLElement).style.flexGrow).toBe("1021812");
    expect(screen.queryByText("Not yet due")).toBeNull();
  });
  it("lists every segment in the legend, with a dash for empty ones", () => {
    render(<ProportionBar variant="bar" legend aria-label="Aging" segments={aging} />);
    expect(screen.getByText("1–30 days")).toBeInTheDocument();
    expect(screen.getByText("31–60 days").closest("div")).toHaveClass("text-ink-3");
    expect(screen.getByText("31–60 days").closest("div")).toHaveTextContent("–");
  });
  it("hatches the whole bar when there is nothing to draw", () => {
    render(<ProportionBar variant="bar" aria-label="Aging" segments={[seg("a", 0)]} />);
    expect(screen.getByRole("img")).toHaveClass("hatch");
  });
});
