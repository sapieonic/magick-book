import { describe, it, expect, afterEach } from "vitest";
import {
  getDomainWhitelist,
  isEmailAllowed,
  whitelistLabel,
  notAllowedMessage,
} from "@/lib/auth/whitelist";

const ORIGINAL = process.env.DOMAIN_WHITELIST;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DOMAIN_WHITELIST;
  else process.env.DOMAIN_WHITELIST = ORIGINAL;
});

function setList(v: string | undefined) {
  if (v === undefined) delete process.env.DOMAIN_WHITELIST;
  else process.env.DOMAIN_WHITELIST = v;
}

describe("getDomainWhitelist", () => {
  it("parses a single domain, stripping the @", () => {
    setList("@magickvoice.com");
    expect(getDomainWhitelist()).toEqual(["magickvoice.com"]);
  });
  it("parses comma-separated domains and trims whitespace", () => {
    setList("@magickvoice.com, @acme.in");
    expect(getDomainWhitelist()).toEqual(["magickvoice.com", "acme.in"]);
  });
  it("lowercases and drops empty entries", () => {
    setList("@MagickVoice.com,, ACME.IN");
    expect(getDomainWhitelist()).toEqual(["magickvoice.com", "acme.in"]);
  });
  it("returns an empty list when unset", () => {
    setList(undefined);
    expect(getDomainWhitelist()).toEqual([]);
  });
});

describe("isEmailAllowed", () => {
  it("allows everyone when the list is empty (allow-all)", () => {
    setList(undefined);
    expect(isEmailAllowed("anyone@anywhere.com")).toBe(true);
  });
  it("matches the configured domain case-insensitively", () => {
    setList("@magickvoice.com");
    expect(isEmailAllowed("priya@magickvoice.com")).toBe(true);
    expect(isEmailAllowed("PRIYA@MAGICKVOICE.COM")).toBe(true);
  });
  it("rejects a domain not on the list", () => {
    setList("@magickvoice.com");
    expect(isEmailAllowed("eve@gmail.com")).toBe(false);
  });
  it("rejects the subdomain-spoof @magickvoice.com.evil.com", () => {
    setList("@magickvoice.com");
    expect(isEmailAllowed("eve@magickvoice.com.evil.com")).toBe(false);
  });
  it("supports multiple allowed domains", () => {
    setList("@magickvoice.com, @acme.in");
    expect(isEmailAllowed("a@acme.in")).toBe(true);
    expect(isEmailAllowed("b@magickvoice.com")).toBe(true);
    expect(isEmailAllowed("c@other.com")).toBe(false);
  });
});

describe("whitelistLabel", () => {
  it("is null when unrestricted", () => {
    setList(undefined);
    expect(whitelistLabel()).toBeNull();
  });
  it("returns a single tagged domain", () => {
    setList("@magickvoice.com");
    expect(whitelistLabel()).toBe("@magickvoice.com");
  });
  it('joins multiple with "or"', () => {
    setList("@magickvoice.com, @acme.in, @foo.com");
    expect(whitelistLabel()).toBe("@magickvoice.com, @acme.in or @foo.com");
  });
});

describe("notAllowedMessage", () => {
  it("names the allowed domains when restricted", () => {
    setList("@magickvoice.com");
    expect(notAllowedMessage()).toBe(
      "Only @magickvoice.com email addresses can sign in to this workspace.",
    );
  });
  it("gives a generic message when unrestricted", () => {
    setList(undefined);
    expect(notAllowedMessage()).toBe("That email address isn't allowed to sign in.");
  });
});
