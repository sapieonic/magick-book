import "server-only";
import { formatINR } from "./utils";
import { STAGE_META, type LeadStage } from "./constants";

/**
 * Slack Incoming-Webhook notifications for lead lifecycle events.
 *
 * Posts a message to a dedicated Slack channel whenever a lead is converted to
 * an account, marked lost, moved between pipeline lanes, or gets a new comment.
 *
 * Configure via env (mirrors how S3 uploads degrade without `INVOICES_BUCKET` —
 * when the webhook URL is unset every notifier here silently no-ops):
 *
 *   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxxx   (required to enable)
 *   SLACK_CHANNEL=C0B8DKZ7PGF        (optional — override the webhook's default channel)
 *   SLACK_BOT_NAME="MagickBook CRM"  (optional — custom bot/username shown in Slack)
 *   SLACK_BOT_ICON=:crystal_ball:    (optional — emoji or image URL for the bot avatar)
 *
 * Delivery is fire-and-forget and never throws, so a Slack outage can't break a
 * CRM mutation. Callers don't need to await it.
 */

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL?.trim();
const CHANNEL = process.env.SLACK_CHANNEL?.trim();
const BOT_NAME = process.env.SLACK_BOT_NAME?.trim() || "MagickBook CRM";
const BOT_ICON = process.env.SLACK_BOT_ICON?.trim() || ":crystal_ball:";

/** Whether Slack notifications are wired up (a webhook URL is present). */
export function isSlackConfigured(): boolean {
  return Boolean(WEBHOOK_URL);
}

/** App base URL for deep-links back into the CRM (best-effort, may be ""). */
function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

function leadUrl(leadId: string): string {
  const base = appBaseUrl();
  return base ? `${base}/leads/${leadId}` : "";
}

function accountUrl(accountId: string): string {
  const base = appBaseUrl();
  return base ? `${base}/accounts/${accountId}` : "";
}

/** Render `<url|text>` as a Slack link, or just the text when we have no URL. */
function link(text: string, url: string): string {
  return url ? `<${url}|${text}>` : `*${text}*`;
}

const stageLabel = (s: string): string => STAGE_META[s as LeadStage]?.label ?? s;

type SlackBlock = Record<string, unknown>;

interface SlackMessage {
  /** Plain-text fallback used for notifications/previews. */
  text: string;
  blocks?: SlackBlock[];
}

/**
 * Low-level delivery. Posts a Block Kit message to the configured webhook.
 * Never throws — failures are logged and swallowed.
 */
async function post(message: SlackMessage): Promise<void> {
  if (!WEBHOOK_URL) return; // not configured → no-op

  const payload: Record<string, unknown> = {
    username: BOT_NAME,
    icon_emoji: BOT_ICON.startsWith(":") ? BOT_ICON : undefined,
    icon_url: BOT_ICON.startsWith("http") ? BOT_ICON : undefined,
    text: message.text,
    blocks: message.blocks,
  };
  if (CHANNEL) payload.channel = CHANNEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) console.error(`[slack] webhook responded ${res.status}`);
  } catch (err) {
    console.error("[slack] delivery failed:", err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(timeout);
  }
}

/** Build a standard "context" footer line listing who triggered the event. */
function actorContext(actorName: string): SlackBlock {
  return {
    type: "context",
    elements: [{ type: "mrkdwn", text: `By ${actorName || "someone"} · ${new Date().toLocaleString("en-IN")}` }],
  };
}

function section(text: string, fields?: string[]): SlackBlock {
  const block: SlackBlock = { type: "section", text: { type: "mrkdwn", text } };
  if (fields?.length) block.fields = fields.map((f) => ({ type: "mrkdwn", text: f }));
  return block;
}

function header(text: string): SlackBlock {
  return { type: "header", text: { type: "plain_text", text, emoji: true } };
}

/* -------------------------------------------------------------- event notifiers */

/** A lead was converted into an account. */
export function notifyLeadConverted(data: {
  leadId: string;
  leadName: string;
  company?: string;
  accountId: string;
  accountName: string;
  estValue?: number;
  ownerName?: string;
  actorName: string;
}): Promise<void> {
  const who = data.company ? `${data.leadName} (${data.company})` : data.leadName;
  const fields = [
    `*Account:*\n${link(data.accountName, accountUrl(data.accountId))}`,
    `*Deal value:*\n${formatINR(data.estValue ?? 0)}`,
  ];
  if (data.ownerName) fields.push(`*Owner:*\n${data.ownerName}`);
  return post({
    text: `🎉 Lead converted: ${who} → ${data.accountName}`,
    blocks: [
      header("🎉 Lead Converted to Account"),
      section(`*${who}* is now an account — ${link(data.accountName, accountUrl(data.accountId))}.`, fields),
      actorContext(data.actorName),
    ],
  });
}

/** A lead was marked lost. */
export function notifyLeadLost(data: {
  leadId: string;
  leadName: string;
  company?: string;
  fromStage: string;
  lostReason?: string;
  estValue?: number;
  actorName: string;
}): Promise<void> {
  const who = data.company ? `${data.leadName} (${data.company})` : data.leadName;
  const fields = [
    `*Was:*\n${stageLabel(data.fromStage)}`,
    `*Deal value:*\n${formatINR(data.estValue ?? 0)}`,
  ];
  const reason = data.lostReason ? `\n>${data.lostReason}` : "";
  return post({
    text: `💔 Lead lost: ${who}`,
    blocks: [
      header("💔 Lead Marked Lost"),
      section(`${link(who, leadUrl(data.leadId))} was marked *lost*.${reason}`, fields),
      actorContext(data.actorName),
    ],
  });
}

/** A lead moved between pipeline lanes/stages. */
export function notifyLeadStageChanged(data: {
  leadId: string;
  leadName: string;
  company?: string;
  fromStage: string;
  toStage: string;
  actorName: string;
}): Promise<void> {
  const who = data.company ? `${data.leadName} (${data.company})` : data.leadName;
  const move = `${stageLabel(data.fromStage)} → *${stageLabel(data.toStage)}*`;
  return post({
    text: `↗️ Lead moved: ${who} (${stageLabel(data.fromStage)} → ${stageLabel(data.toStage)})`,
    blocks: [
      header("↗️ Lead Moved Lanes"),
      section(`${link(who, leadUrl(data.leadId))} moved ${move}.`),
      actorContext(data.actorName),
    ],
  });
}

/** A comment / activity note was added to a lead. */
export function notifyLeadComment(data: {
  leadId: string;
  leadName: string;
  company?: string;
  title: string;
  detail?: string;
  actorName: string;
}): Promise<void> {
  const who = data.company ? `${data.leadName} (${data.company})` : data.leadName;
  const body = data.detail ? `\n>${data.detail}` : "";
  return post({
    text: `💬 ${data.title} on ${who}`,
    blocks: [
      header("💬 New Comment on Lead"),
      section(`*${data.title}* on ${link(who, leadUrl(data.leadId))}${body}`),
      actorContext(data.actorName),
    ],
  });
}
