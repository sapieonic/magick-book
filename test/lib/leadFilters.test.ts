import { describe, it, expect } from "vitest";
import {
  deriveOwners,
  filterLeadsByOwners,
  parseOwnerParam,
  serializeOwnerParam,
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

describe("filterLeadsByOwners", () => {
  const leads = [
    lead({ id: "1", ownerId: "a" }),
    lead({ id: "2", ownerId: "b" }),
    lead({ id: "3", ownerId: "c" }),
    lead({ id: "4", ownerId: "a" }),
  ];

  it("returns the same array reference when no owners are selected", () => {
    expect(filterLeadsByOwners(leads, [])).toBe(leads);
  });

  it("keeps only leads owned by a single selected owner", () => {
    expect(filterLeadsByOwners(leads, ["b"]).map((l) => l.id)).toEqual(["2"]);
  });

  it("keeps every lead of a single owner", () => {
    expect(filterLeadsByOwners(leads, ["a"]).map((l) => l.id)).toEqual(["1", "4"]);
  });

  it("keeps leads owned by any of several selected owners (OR within owners)", () => {
    expect(filterLeadsByOwners(leads, ["a", "c"]).map((l) => l.id)).toEqual(["1", "3", "4"]);
  });

  it("preserves the original ordering of the leads", () => {
    expect(filterLeadsByOwners(leads, ["c", "a"]).map((l) => l.id)).toEqual(["1", "3", "4"]);
  });

  it("returns nothing for an owner id that matches no lead", () => {
    expect(filterLeadsByOwners(leads, ["ghost"])).toEqual([]);
  });

  it("ignores unknown ids mixed with a matching one", () => {
    expect(filterLeadsByOwners(leads, ["ghost", "b"]).map((l) => l.id)).toEqual(["2"]);
  });

  it("tolerates duplicate ids in the selection", () => {
    expect(filterLeadsByOwners(leads, ["a", "a"]).map((l) => l.id)).toEqual(["1", "4"]);
  });

  it("returns an empty array for empty leads", () => {
    expect(filterLeadsByOwners([], ["a"])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const snapshot = leads.map((l) => l.id);
    filterLeadsByOwners(leads, ["a"]);
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
