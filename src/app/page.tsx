import { redirect } from "next/navigation";

// The proxy (src/proxy.ts) redirects unauthenticated visitors to /login, so
// reaching the root means there's a session — send them to the dashboard.
export default function Home() {
  redirect("/dashboard");
}
