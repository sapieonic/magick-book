import { afterAll, beforeAll } from "vitest";

/**
 * Browser zones the IST date tests run under: the host's own zone, one at UTC
 * in winter, and one behind UTC. Node re-reads `process.env.TZ` at runtime, so
 * local getters (`getHours()`, `new Date("2026-11-15T09:00")`) follow it.
 */
export const ZONES = ["host", "Europe/London", "America/Los_Angeles"] as const;

/** Run the enclosing describe block with the process in `zone` ("host" leaves it alone). */
export function useTimeZone(zone: (typeof ZONES)[number]) {
  const before = process.env.TZ;
  beforeAll(() => {
    if (zone !== "host") process.env.TZ = zone;
  });
  afterAll(() => {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  });
}
