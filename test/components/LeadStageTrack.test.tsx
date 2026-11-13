// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StageTrack } from "@/components/leads/detail/StageTrack";
import { dateRange, durationWords, timeInStages } from "@/components/leads/detail/stage-time";
import type { LeadDTO, LeadStageSpan } from "@/lib/types";

const NOW = new Date("2026-11-13T09:00:00.000Z");

function lead(over: Partial<LeadDTO> = {}): LeadDTO {
  return {
    id: "l1", name: "Naresh", company: "Shivasakthi", title: "", phone: "", email: "", source: "Referral", stage: "qualified",
    category: "unclassified", estValue: 50000, notes: "", tags: [], lostReason: "", ownerId: "u1", ownerName: "Pooja",
    convertedAccountId: null, order: 0, commentCount: 0, lastActivityAt: "2026-07-16T09:00:00.000Z",
    createdAt: "2026-07-02T09:00:00.000Z", deletedAt: null, ...over,
  };
}

const SPANS: LeadStageSpan[] = [
  { stage: "new", enteredAt: "2026-07-02T09:00:00.000Z", leftAt: "2026-07-05T09:00:00.000Z" },
  { stage: "contacted", enteredAt: "2026-07-05T09:00:00.000Z", leftAt: "2026-07-14T09:00:00.000Z" },
  { stage: "qualified", enteredAt: "2026-07-14T09:00:00.000Z", leftAt: null },
];

describe("stage time helpers", () => {
  it("sums revisits and keeps the first entry and last exit", () => {
    const t = timeInStages(
      [
        { stage: "new", enteredAt: "2026-07-01T00:00:00.000Z", leftAt: "2026-07-03T00:00:00.000Z" },
        { stage: "contacted", enteredAt: "2026-07-03T00:00:00.000Z", leftAt: "2026-07-04T00:00:00.000Z" },
        { stage: "new", enteredAt: "2026-07-04T00:00:00.000Z", leftAt: "2026-07-07T00:00:00.000Z" },
      ],
      NOW.getTime(),
    );
    expect(t.get("new")).toEqual({ ms: 5 * 86_400_000, from: "2026-07-01T00:00:00.000Z", to: "2026-07-07T00:00:00.000Z" });
  });

  it("measures an open span up to now", () => {
    const t = timeInStages([{ stage: "qualified", enteredAt: "2026-11-10T09:00:00.000Z", leftAt: null }], NOW.getTime());
    expect(durationWords(t.get("qualified")!.ms)).toBe("3 days");
  });

  it("writes durations and ranges in words", () => {
    expect(durationWords(3_600_000)).toBe("Under a day");
    expect(durationWords(122 * 86_400_000)).toBe("4 months");
    expect(dateRange("2026-07-02T09:00:00Z", "2026-07-05T09:00:00Z", NOW)).toBe("2 to 5 Jul");
    expect(dateRange("2026-06-28T09:00:00Z", "2026-07-05T09:00:00Z", NOW)).toBe("28 Jun to 5 Jul");
    expect(dateRange("2025-12-28T09:00:00Z", "2026-01-05T09:00:00Z", NOW)).toBe("28 Dec 2025 to 5 Jan 2026");
  });
});

describe("StageTrack", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("shows time spent in done stages and flags a stale current stage", () => {
    render(<StageTrack lead={lead()} spans={SPANS} locked={false} pending={null} onMove={vi.fn()} onConvert={vi.fn()} />);
    expect(screen.getByText("3 days · 2 to 5 Jul")).toBeInTheDocument();
    expect(screen.getByText("9 days · 5 to 14 Jul")).toBeInTheDocument();
    const current = screen.getByRole("button", { current: "step" });
    expect(current).toBeDisabled();
    expect(current).toHaveTextContent("Qualified");
    expect(screen.getByText("4 months here · since 14 Jul")).toHaveClass("text-overdue");
    expect(screen.getByText("Move here")).toBeInTheDocument();
  });

  it("moves to a clicked stage, and opens the convert flow for Won", () => {
    const onMove = vi.fn();
    const onConvert = vi.fn();
    render(<StageTrack lead={lead()} spans={SPANS} locked={false} pending={null} onMove={onMove} onConvert={onConvert} />);
    fireEvent.click(screen.getByRole("button", { name: /Proposal/ }));
    expect(onMove).toHaveBeenCalledWith("proposal");
    fireEvent.click(screen.getByRole("button", { name: /Won/ }));
    expect(onConvert).toHaveBeenCalled();
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("locks every stage when the lead cannot be moved", () => {
    render(<StageTrack lead={lead()} spans={SPANS} locked pending={null} onMove={vi.fn()} onConvert={vi.fn()} />);
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
    expect(screen.queryByText("Move here")).not.toBeInTheDocument();
  });

  it("explains a parked lead and marks the stages it visited", () => {
    const spans: LeadStageSpan[] = [
      { stage: "new", enteredAt: "2026-07-02T09:00:00.000Z", leftAt: "2026-07-05T09:00:00.000Z" },
      { stage: "parked", enteredAt: "2026-07-05T09:00:00.000Z", leftAt: null },
    ];
    render(<StageTrack lead={lead({ stage: "parked" })} spans={spans} locked={false} pending={null} onMove={vi.fn()} onConvert={vi.fn()} />);
    expect(screen.getByText("Parked")).toBeInTheDocument();
    expect(screen.getByText("Pick a stage to bring it back into the funnel.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New/ })).toHaveTextContent("1 · done");
    expect(screen.queryByRole("button", { current: "step" })).not.toBeInTheDocument();
  });
});
