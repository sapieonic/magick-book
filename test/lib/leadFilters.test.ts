import { describe, it, expect } from "vitest";
import {
  deriveOwners,
  filterByOwners,
  parseOwnerParam,
  parseStageParam,
  serializeOwnerParam,
  stageTotals,
  summarizeLeads,
} from "@/lib/leadFilters";
import type { LeadDTO } from "@/lib/types";

// Minimal LeadDTO factory — only the fields the filters touch matter here.
let seq = 0;
function lead(over: Partial<LeadDTO>): LeadDTO {
  return {
    id: `lead-${seq++}`,
    name: "Lead",
    company: "",
    title: "",
    phone: "",
    email: "",
    source: "Website",
    stage: "new",
    category: "unclassified",
    estValue: 0,
    notes: "",
    tags: [],
    lostReason: "",
    ownerId: "o1",
    ownerName: "Riya Nair",
    convertedAccountId: null,
    order: 0,
    commentCount: 0,
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...over,
  };
}

describe("deriveOwners", () => {
  it("returns an empty list for no leads", () => {
    expect(deriveOwners([])).toEqual([]);
  });

  it("returns a single owner with count 1 for one lead", () => {
    expect(deriveOwners([lead({ ownerId: "a", ownerName: "Amit" })])).toEqual([
      { id: "a", name: "Amit", count: 1 },
    ]);
  });

  it("dedupes by owner id and counts leads per owner", () => {
    const owners = deriveOwners([
      lead({ ownerId: "a", ownerName: "Amit" }),
      lead({ ownerId: "a", ownerName: "Amit" }),
      lead({ ownerId: "b", ownerName: "Bela" }),
    ]);
    expect(owners).toEqual([
      { id: "a", name: "Amit", count: 2 },
      { id: "b", name: "Bela", count: 1 },
    ]);
  });

  it("sorts owners by name, not by id or first appearance", () => {
    const owners = deriveOwners([
      lead({ ownerId: "z", ownerName: "Zara" }),
      lead({ ownerId: "a", ownerName: "Amit" }),
      lead({ ownerId: "m", ownerName: "Mira" }),
    ]);
    expect(owners.map((o) => o.name)).toEqual(["Amit", "Mira", "Zara"]);
  });

  it("sorts case-insensitively via localeCompare", () => {
    const owners = deriveOwners([
      lead({ ownerId: "1", ownerName: "bela" }),
      lead({ ownerId: "2", ownerName: "Amit" }),
    ]);
    expect(owners.map((o) => o.name)).toEqual(["Amit", "bela"]);
  });

  it("counts leads across all stages, including lost and won", () => {
    const owners = deriveOwners([
      lead({ ownerId: "a", ownerName: "Amit", stage: "new" }),
      lead({ ownerId: "a", ownerName: "Amit", stage: "lost" }),
      lead({ ownerId: "a", ownerName: "Amit", stage: "won" }),
    ]);
    expect(owners[0].count).toBe(3);
  });

  it("skips leads with an empty owner id", () => {
    expect(deriveOwners([lead({ ownerId: "", ownerName: "Ghost" })])).toEqual([]);
  });

  it("skips leads with a blank or whitespace-only owner name", () => {
    const owners = deriveOwners([
      lead({ ownerId: "a", ownerName: "" }),
      lead({ ownerId: "b", ownerName: "   " }),
      lead({ ownerId: "c", ownerName: "Bela" }),
    ]);
    expect(owners).toEqual([{ id: "c", name: "Bela", count: 1 }]);
  });

  it("keeps two distinct owners who happen to share a display name", () => {
    const owners = deriveOwners([
      lead({ ownerId: "a1", ownerName: "Amit Kumar" }),
      lead({ ownerId: "a2", ownerName: "Amit Kumar" }),
    ]);
    expect(owners).toEqual([
      { id: "a1", name: "Amit Kumar", count: 1 },
      { id: "a2", name: "Amit Kumar", count: 1 },
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [lead({ ownerId: "a", ownerName: "Amit" })];
    const snapshot = JSON.stringify(input);
    deriveOwners(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("filterByOwners", () => {
  const leads = [
    lead({ id: "1", ownerId: "a" }),
    lead({ id: "2", ownerId: "b" }),
    lead({ id: "3", ownerId: "c" }),
    lead({ id: "4", ownerId: "a" }),
  ];

  it("returns the same array reference when no owners are selected", () => {
    expect(filterByOwners(leads, [])).toBe(leads);
  });

  it("keeps only leads owned by a single selected owner", () => {
    expect(filterByOwners(leads, ["b"]).map((l) => l.id)).toEqual(["2"]);
  });

  it("keeps every lead of a single owner", () => {
    expect(filterByOwners(leads, ["a"]).map((l) => l.id)).toEqual(["1", "4"]);
  });

  it("keeps leads owned by any of several selected owners (OR within owners)", () => {
    expect(filterByOwners(leads, ["a", "c"]).map((l) => l.id)).toEqual(["1", "3", "4"]);
  });

  it("preserves the original ordering of the leads", () => {
    expect(filterByOwners(leads, ["c", "a"]).map((l) => l.id)).toEqual(["1", "3", "4"]);
  });

  it("returns nothing for an owner id that matches no lead", () => {
    expect(filterByOwners(leads, ["ghost"])).toEqual([]);
  });

  it("ignores unknown ids mixed with a matching one", () => {
    expect(filterByOwners(leads, ["ghost", "b"]).map((l) => l.id)).toEqual(["2"]);
  });

  it("tolerates duplicate ids in the selection", () => {
    expect(filterByOwners(leads, ["a", "a"]).map((l) => l.id)).toEqual(["1", "4"]);
  });

  it("returns an empty array for empty leads", () => {
    expect(filterByOwners([], ["a"])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const snapshot = leads.map((l) => l.id);
    filterByOwners(leads, ["a"]);
    expect(leads.map((l) => l.id)).toEqual(snapshot);
  });
});

describe("parseOwnerParam", () => {
  it("parses a comma list into ids", () => {
    expect(parseOwnerParam("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("parses a single id", () => {
    expect(parseOwnerParam("a")).toEqual(["a"]);
  });

  it("treats null, undefined and empty string as no selection", () => {
    expect(parseOwnerParam(null)).toEqual([]);
    expect(parseOwnerParam(undefined)).toEqual([]);
    expect(parseOwnerParam("")).toEqual([]);
  });

  it("drops empty segments from stray/leading/trailing commas", () => {
    expect(parseOwnerParam("a,,b,")).toEqual(["a", "b"]);
    expect(parseOwnerParam(",a")).toEqual(["a"]);
  });

  it("trims surrounding whitespace on each id", () => {
    expect(parseOwnerParam(" a , b ")).toEqual(["a", "b"]);
  });

  it("de-dupes while preserving first-seen order", () => {
    expect(parseOwnerParam("b,a,b,a")).toEqual(["b", "a"]);
  });

  it("de-dupes ids that differ only by surrounding whitespace", () => {
    expect(parseOwnerParam("a, a")).toEqual(["a"]);
  });

  it("returns [] for a string of only separators/whitespace", () => {
    expect(parseOwnerParam(" , , ")).toEqual([]);
  });
});

describe("serializeOwnerParam", () => {
  it("joins ids with commas", () => {
    expect(serializeOwnerParam(["a", "b", "c"])).toBe("a,b,c");
  });

  it("serializes a single id", () => {
    expect(serializeOwnerParam(["a"])).toBe("a");
  });

  it("serializes an empty selection to an empty string", () => {
    expect(serializeOwnerParam([])).toBe("");
  });

  it("round-trips a multi-id selection through parse", () => {
    const ids = ["a", "b", "c"];
    expect(parseOwnerParam(serializeOwnerParam(ids))).toEqual(ids);
  });

  it("round-trips a single-id selection through parse", () => {
    expect(parseOwnerParam(serializeOwnerParam(["only"]))).toEqual(["only"]);
  });
});

describe("parseStageParam", () => {
  it("accepts every known stage, case-insensitively", () => {
    expect(parseStageParam("qualified")).toBe("qualified");
    expect(parseStageParam(" Won ")).toBe("won");
    expect(parseStageParam("parked")).toBe("parked");
    expect(parseStageParam("lost")).toBe("lost");
  });

  it("returns null for a missing or unknown stage", () => {
    expect(parseStageParam(null)).toBeNull();
    expect(parseStageParam(undefined)).toBeNull();
    expect(parseStageParam("")).toBeNull();
    expect(parseStageParam("closed")).toBeNull();
  });
});

describe("summarizeLeads", () => {
  it("rolls up pipeline value and counts in one pass", () => {
    const sum = summarizeLeads([
      lead({ stage: "new", estValue: 10_000 }),
      lead({ stage: "proposal", estValue: 40_000 }),
      lead({ stage: "won", estValue: 100_000 }),
      lead({ stage: "parked", estValue: 70_000 }),
      lead({ stage: "lost", estValue: 90_000 }),
      lead({ stage: "lost", estValue: 0 }),
    ]);
    // Won is still on the funnel; parked and lost are not.
    expect(sum).toEqual({ pipeline: 150_000, active: 3, won: 1, parked: 1, lost: 2 });
  });

  it("ignores negative values in the pipeline total", () => {
    expect(summarizeLeads([lead({ estValue: -500 }), lead({ estValue: 500 })]).pipeline).toBe(500);
  });

  it("is all zeros for no leads", () => {
    expect(summarizeLeads([])).toEqual({ pipeline: 0, active: 0, won: 0, parked: 0, lost: 0 });
  });
});

describe("stageTotals", () => {
  it("counts, sums and shares value per funnel stage", () => {
    const totals = stageTotals([
      lead({ stage: "new", estValue: 25_000 }),
      lead({ stage: "new", estValue: 0 }),
      lead({ stage: "qualified", estValue: 75_000 }),
      lead({ stage: "parked", estValue: 1_000_000 }),
      lead({ stage: "lost", estValue: 1_000_000 }),
    ]);
    expect(totals.new).toEqual({ count: 2, value: 25_000, share: 0.25 });
    expect(totals.qualified).toEqual({ count: 1, value: 75_000, share: 0.75 });
    expect(totals.proposal).toEqual({ count: 0, value: 0, share: 0 });
    expect(Object.keys(totals)).toEqual(["new", "contacted", "qualified", "proposal", "won"]);
  });

  it("leaves every share at zero when nothing has a value", () => {
    const totals = stageTotals([lead({ stage: "won", estValue: 0 })]);
    expect(totals.won).toEqual({ count: 1, value: 0, share: 0 });
  });
});
