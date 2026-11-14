const HOME = "/dashboard";
const ORIGIN = "http://same.invalid";

/**
 * Where to go after signing in. Only a path on this site is accepted
 * ("/accounts/42?tab=x"); anything that would leave it ("https://…", "//…",
 * "/\…", or tricks a URL parser normalises into those) falls back to the dashboard.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return HOME;
  try {
    const url = new URL(next, ORIGIN);
    return url.origin === ORIGIN ? `${url.pathname}${url.search}${url.hash}` : HOME;
  } catch {
    return HOME;
  }
}
