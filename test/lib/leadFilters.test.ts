import { describe, it, expect } from "vitest";
import {
  deriveOwners,
  filterLeadsByOwners,
  parseOwnerParam,
  serializeOwnerParam,
} from "@/lib/leadFilters";
import type { LeadDTO } from "@/lib/types";

// Minimal LeadDTO factory — only the fields the filters touch matter here.
function lead(over: Partial<LeadDTO>): LeadDTO {
  return {
    id: Math.random().toString(36).slice(2),
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

  it("sorts owners by name", () => {
    const owners = deriveOwners([
      lead({ ownerId: "z", ownerName: "Zara" }),
      lead({ ownerId: "a", ownerName: "Amit" }),
      lead({ ownerId: "m", ownerName: "Mira" }),
    ]);
    expect(owners.map((o) => o.name)).toEqual(["Amit", "Mira", "Zara"]);
  });

  it("counts leads across all stages, including lost", () => {
    const owners = deriveOwners([
      lead({ ownerId: "a", ownerName: "Amit", stage: "new" }),
      lead({ ownerId: "a", ownerName: "Amit", stage: "lost" }),
    ]);
    expect(owners[0].count).toBe(2);
  });

  it("skips leads with no owner id or a blank owner name", () => {
    const owners = deriveOwners([
      lead({ ownerId: "", ownerName: "Ghost" }),
      lead({ ownerId: "a", ownerName: "   " }),
      lead({ ownerId: "b", ownerName: "Bela" }),
    ]);
    expect(owners).toEqual([{ id: "b", name: "Bela", count: 1 }]);
  });
});

describe("filterLeadsByOwners", () => {
  const leads = [
    lead({ id: "1", ownerId: "a" }),
    lead({ id: "2", ownerId: "b" }),
    lead({ id: "3", ownerId: "c" }),
  ];

  it("returns all leads when no owners are selected", () => {
    expect(filterLeadsByOwners(leads, [])).toBe(leads);
  });

  it("keeps only leads owned by a single selected owner", () => {
    expect(filterLeadsByOwners(leads, ["b"]).map((l) => l.id)).toEqual(["2"]);
  });

  it("keeps leads owned by any of several selected owners (OR within owners)", () => {
    expect(filterLeadsByOwners(leads, ["a", "c"]).map((l) => l.id)).toEqual(["1", "3"]);
  });

  it("returns nothing for an owner id that matches no lead", () => {
    expect(filterLeadsByOwners(leads, ["ghost"])).toEqual([]);
  });
});

describe("parseOwnerParam / serializeOwnerParam", () => {
  it("parses a comma list into ids", () => {
    expect(parseOwnerParam("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("treats null/empty as no selection", () => {
    expect(parseOwnerParam(null)).toEqual([]);
    expect(parseOwnerParam("")).toEqual([]);
    expect(parseOwnerParam(undefined)).toEqual([]);
  });

  it("drops blanks and de-dupes while preserving order", () => {
    expect(parseOwnerParam("a,,b, a ,b")).toEqual(["a", "b"]);
  });

  it("round-trips through serialize", () => {
    const ids = ["a", "b", "c"];
    expect(parseOwnerParam(serializeOwnerParam(ids))).toEqual(ids);
  });
});
