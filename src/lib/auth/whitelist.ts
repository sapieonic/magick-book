// Email-domain allow-list for sign-in.
//
// Configured via the DOMAIN_WHITELIST env var, e.g.
//   DOMAIN_WHITELIST=@magickvoice.com
//   DOMAIN_WHITELIST=@magickvoice.com, @acme.in   (comma-separated for several)
//
// When unset/empty, any email may sign in. When set, only emails whose domain
// matches an entry are allowed — enforced on Firebase sign-in, demo sign-in,
// and teammate invites. Read server-side only (never exposed as NEXT_PUBLIC).

/** Normalized list of allowed domains (lowercase, no leading "@"). */
export function getDomainWhitelist(): string[] {
  const raw = process.env.DOMAIN_WHITELIST;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/** True if the email's domain is allowed (always true when no list is set). */
export function isEmailAllowed(email: string): boolean {
  const list = getDomainWhitelist();
  if (!list.length) return true;
  const domain = email.toLowerCase().trim().split("@")[1] ?? "";
  return list.includes(domain);
}

/** Human-readable "@a.com or @b.com" label, or null when unrestricted. */
export function whitelistLabel(): string | null {
  const list = getDomainWhitelist();
  if (!list.length) return null;
  const tagged = list.map((d) => `@${d}`);
  if (tagged.length === 1) return tagged[0];
  return `${tagged.slice(0, -1).join(", ")} or ${tagged[tagged.length - 1]}`;
}

/** Standard rejection message shown to blocked users. */
export function notAllowedMessage(): string {
  const label = whitelistLabel();
  return label
    ? `Only ${label} email addresses can sign in to this workspace.`
    : "That email address isn't allowed to sign in.";
}
