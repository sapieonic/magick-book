// Pure helpers behind the Leads owner filter. Kept free of React/Next so the
// derivation, filtering, and URL round-trip can be unit-tested in isolation.
import type { LeadDTO } from "./types";

export interface OwnerOption {
  id: string;
  name: string;
  /** How many of the supplied leads this person owns — a Jira-style count. */
  count: number;
}

/**
 * The pool of people you can filter by: everyone who owns one of `leads`, with
 * their lead counts, sorted by name. Leads without an owner are skipped.
 */
export function deriveOwners(leads: LeadDTO[]): OwnerOption[] {
  const byId = new Map<string, OwnerOption>();
  for (const l of leads) {
    if (!l.ownerId || !l.ownerName?.trim()) continue;
    const existing = byId.get(l.ownerId);
    if (existing) existing.count += 1;
    else byId.set(l.ownerId, { id: l.ownerId, name: l.ownerName, count: 1 });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Narrow `leads` to those owned by one of `ownerIds`. No selection → everything. */
export function filterLeadsByOwners(leads: LeadDTO[], ownerIds: string[]): LeadDTO[] {
  if (ownerIds.length === 0) return leads;
  const set = new Set(ownerIds);
  return leads.filter((l) => set.has(l.ownerId));
}

/** Parse a `?owner=a,b` param into a de-duped list of ids (order preserved). */
export function parseOwnerParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of raw.split(",")) {
    const trimmed = id.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      ids.push(trimmed);
    }
  }
  return ids;
}

/** Serialize selected owner ids back to the `?owner=` param value. */
export function serializeOwnerParam(ownerIds: string[]): string {
  return ownerIds.join(",");
}
