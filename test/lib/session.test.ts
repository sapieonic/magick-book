import { describe, it, expect, afterEach } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

const SECRET = process.env.SESSION_SECRET;

afterEach(() => {
  if (SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = SECRET;
});

const payload = { uid: "demo:a@x.com", email: "a@x.com", name: "Ada" };

describe("session token round-trip", () => {
  it("verifies a token it signed", async () => {
    const token = await createSessionToken(payload);
    expect(await verifySessionToken(token)).toEqual(payload);
  });

  it("defaults a missing name to empty string", async () => {
    const token = await createSessionToken({ ...payload, name: "" });
    const out = await verifySessionToken(token);
    expect(out?.name).toBe("");
  });

  it("returns null for a tampered token", async () => {
    const token = await createSessionToken(payload);
    const tampered = token.slice(0, -3) + "xyz";
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("returns null for a garbage token", async () => {
    expect(await verifySessionToken("not.a.jwt")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("returns null when verified with a different secret", async () => {
    process.env.SESSION_SECRET = "secret-one";
    const token = await createSessionToken(payload);
    process.env.SESSION_SECRET = "secret-two";
    expect(await verifySessionToken(token)).toBeNull();
  });
});
