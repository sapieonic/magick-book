// Pure helpers behind the Leads page: owner filter, `?stage=` param and the
// pipeline roll-ups. Kept free of React/Next so the derivation, filtering and
// URL round-trip can be unit-tested in isolation.
import { LEAD_STAGES, PIPELINE_STAGES, type LeadStage, type PipelineStage } from "./constants";
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

/** Parse a `?stage=` param into a known stage, or null when absent or unknown. */
export function parseStageParam(raw: string | null | undefined): LeadStage | null {
  const stage = raw?.trim().toLowerCase();
  return stage && (LEAD_STAGES as readonly string[]).includes(stage) ? (stage as LeadStage) : null;
}

export interface LeadSummary {
  /** Value of every lead still on the funnel, New through Won. */
  pipeline: number;
  /** Leads on the funnel, New through Won (parked and lost excluded). */
  active: number;
  won: number;
  parked: number;
  lost: number;
}

/** One-pass roll-up for the page's summary line and the Lost view count. */
export function summarizeLeads(leads: LeadDTO[]): LeadSummary {
  const sum: LeadSummary = { pipeline: 0, active: 0, won: 0, parked: 0, lost: 0 };
  for (const l of leads) {
    if (l.stage === "lost") sum.lost += 1;
    else if (l.stage === "parked") sum.parked += 1;
    else {
      sum.active += 1;
      sum.pipeline += l.estValue > 0 ? l.estValue : 0;
      if (l.stage === "won") sum.won += 1;
    }
  }
  return sum;
}

export interface StageTotal {
  count: number;
  value: number;
  /** This stage's share of the whole pipeline's value, 0..1. */
  share: number;
}

/** Count, value and share of pipeline value for each of the five funnel stages. */
export function stageTotals(leads: LeadDTO[]): Record<PipelineStage, StageTotal> {
  const totals = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, { count: 0, value: 0, share: 0 }])) as Record<PipelineStage, StageTotal>;
  let pipeline = 0;
  for (const l of leads) {
    const t = totals[l.stage as PipelineStage];
    if (!t) continue;
    const value = l.estValue > 0 ? l.estValue : 0;
    t.count += 1;
    t.value += value;
    pipeline += value;
  }
  if (pipeline > 0) for (const s of PIPELINE_STAGES) totals[s].share = totals[s].value / pipeline;
  return totals;
}
