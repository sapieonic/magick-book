import { describe, it, expect } from "vitest";
import {
  BOARD_STAGES,
  COLLAPSIBLE_STAGES,
  LEAD_STAGES,
  PIPELINE_STAGES,
  STAGE_META,
  isActiveLeadStage,
  isCollapsibleStage,
} from "@/lib/constants";

describe("lead stages", () => {
  it("includes parked in the domain enum and board, but not the sequential funnel", () => {
    expect(LEAD_STAGES).toContain("parked");
    expect(BOARD_STAGES).toContain("parked");
    expect(PIPELINE_STAGES).not.toContain("parked");
    expect(STAGE_META.parked.label).toBe("Parked");
  });

  it("treats parked (and lost) as inactive, and won as still active", () => {
    expect(isActiveLeadStage("new")).toBe(true);
    expect(isActiveLeadStage("won")).toBe(true);
    expect(isActiveLeadStage("parked")).toBe(false);
    expect(isActiveLeadStage("lost")).toBe(false);
  });

  it("marks parked and won as collapsible board columns", () => {
    expect(COLLAPSIBLE_STAGES).toEqual(["won", "parked"]);
    expect(isCollapsibleStage("parked")).toBe(true);
    expect(isCollapsibleStage("won")).toBe(true);
    expect(isCollapsibleStage("new")).toBe(false);
  });
});
