import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The slack module reads env at import time, so each test sets env then imports
// a fresh copy via vi.resetModules() + dynamic import.
type SlackModule = typeof import("@/lib/slack");

const WEBHOOK = "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX";

async function load(env: Record<string, string | undefined>): Promise<SlackModule> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/slack");
}

function mockFetch(ok = true) {
  const fn = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500 });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ORIGINAL = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  // Restore the slack-related env keys we touch.
  for (const k of ["SLACK_WEBHOOK_URL", "SLACK_CHANNEL", "SLACK_BOT_NAME", "SLACK_BOT_ICON", "APP_BASE_URL", "NEXT_PUBLIC_APP_URL"]) {
    if (ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL[k];
  }
});

describe("slack notifications", () => {
  it("no-ops (and never fetches) when no webhook URL is configured", async () => {
    const fetchFn = mockFetch();
    const slack = await load({ SLACK_WEBHOOK_URL: undefined });

    expect(slack.isSlackConfigured()).toBe(false);
    await slack.notifyLeadConverted({ leadId: "l1", leadName: "Riya", accountId: "a1", accountName: "Acme", actorName: "Neha" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reports configured when a webhook URL is set", async () => {
    const slack = await load({ SLACK_WEBHOOK_URL: WEBHOOK });
    expect(slack.isSlackConfigured()).toBe(true);
  });

  it("posts a converted-lead message with bot name, channel and blocks", async () => {
    const fetchFn = mockFetch();
    const slack = await load({
      SLACK_WEBHOOK_URL: WEBHOOK,
      SLACK_CHANNEL: "C0B8DKZ7PGF",
      SLACK_BOT_NAME: "Deal Bot",
      APP_BASE_URL: "https://crm.example.com",
    });

    await slack.notifyLeadConverted({
      leadId: "l1", leadName: "Riya", company: "Acme Corp",
      accountId: "a1", accountName: "Acme Corp", estValue: 120000,
      ownerName: "Neha", actorName: "Neha",
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.username).toBe("Deal Bot");
    expect(body.channel).toBe("C0B8DKZ7PGF");
    expect(body.text).toContain("Riya");
    expect(Array.isArray(body.blocks)).toBe(true);
    // Deep-link to the new account should be embedded in a block.
    expect(JSON.stringify(body.blocks)).toContain("https://crm.example.com/accounts/a1");
    expect(JSON.stringify(body.blocks)).toContain("₹1,20,000");
  });

  it("distinguishes a lost lead and carries the reason", async () => {
    const fetchFn = mockFetch();
    const slack = await load({ SLACK_WEBHOOK_URL: WEBHOOK });

    await slack.notifyLeadLost({
      leadId: "l9", leadName: "Sam", fromStage: "proposal",
      lostReason: "Budget cut", estValue: 50000, actorName: "Riya",
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.text).toContain("lost");
    expect(JSON.stringify(body.blocks)).toContain("Budget cut");
    expect(JSON.stringify(body.blocks)).toContain("Proposal");
  });

  it("formats a lane move with the human stage labels", async () => {
    const fetchFn = mockFetch();
    const slack = await load({ SLACK_WEBHOOK_URL: WEBHOOK });

    await slack.notifyLeadStageChanged({
      leadId: "l3", leadName: "Mia", fromStage: "new", toStage: "qualified", actorName: "Neha",
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.text).toContain("New");
    expect(body.text).toContain("Qualified");
  });

  it("posts a comment message with the note body", async () => {
    const fetchFn = mockFetch();
    const slack = await load({ SLACK_WEBHOOK_URL: WEBHOOK });

    await slack.notifyLeadComment({
      leadId: "l4", leadName: "Dev", title: "Note added", detail: "Following up next week", actorName: "Riya",
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.text).toContain("Note added");
    expect(JSON.stringify(body.blocks)).toContain("Following up next week");
  });

  it("never throws when delivery fails", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchFn);
    const slack = await load({ SLACK_WEBHOOK_URL: WEBHOOK });

    await expect(
      slack.notifyLeadComment({ leadId: "l5", leadName: "Ana", title: "Call logged", actorName: "Neha" }),
    ).resolves.toBeUndefined();
  });
});
