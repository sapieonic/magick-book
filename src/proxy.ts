import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

// Routes that don't require a session.
const PUBLIC_PATHS = ["/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Signed-in users shouldn't sit on the login page.
  if (session && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Everything else requires a session.
  if (!session && !isPublic) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Protect app pages; skip API (handlers guard themselves), static assets,
  // and the onboarding route (it has its own server-side gating).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.png|icon.png).*)"],
};
