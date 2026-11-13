"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field, Label } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { safeNextPath } from "./next-path";

interface AuthConfig {
  firebase: boolean;
  demo: boolean;
  firebaseConfig: Record<string, string> | null;
  allowedDomains: string | null;
}

type Mode = "signin" | "signup";

/** Seeded demo users (see src/lib/seed.ts). */
const DEMO_ACCOUNTS = [
  { email: "riya@acme.in", name: "Riya Nair", role: "Admin, owner" },
  { email: "neha@acme.in", name: "Neha Gupta", role: "Standard user" },
];

export function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const { toast } = useToast();

  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.get<AuthConfig>("/api/auth/config").then(setConfig).catch(() => setConfig({ firebase: false, demo: true, firebaseConfig: null, allowedDomains: null }));
  }, []);

  const demoMode = config !== null && config.demo && !config.firebase;
  const canSignIn = config === null || config.firebase || config.demo;
  const demoAccounts = demoMode ? DEMO_ACCOUNTS.filter((a) => !config.allowedDomains || config.allowedDomains.includes(`@${a.email.split("@")[1]}`)) : [];

  /** Run a sign-in attempt; on success go to `next`, on failure toast and re-enable. */
  async function attempt(key: string, signIn: () => Promise<void>) {
    setBusy(key);
    try {
      await signIn();
      router.replace(next);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Sign-in failed", "error");
      setBusy(null);
    }
  }

  /** Exchange a Firebase ID token for our session cookie; sign out of Firebase if the server refuses (e.g. domain not allowed). */
  async function startSession(fb: typeof import("@/lib/auth/firebase-client"), idToken: string) {
    try {
      await api.post("/api/auth/session", { idToken });
    } catch (sessionErr) {
      await fb.firebaseSignOut();
      throw sessionErr;
    }
  }

  function signInWithEmail(address: string, key = address) {
    return attempt(key, async () => {
      if (config?.firebase) {
        const fb = await import("@/lib/auth/firebase-client");
        await startSession(fb, await fb.firebaseSignInWithEmail(address, password, mode === "signup"));
      } else {
        // Demo mode is passwordless: the email picks which seeded user you are.
        await api.post("/api/auth/demo", { email: address });
      }
    });
  }

  function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) signInWithEmail(email.trim(), "email");
  }

  function handleGoogle() {
    if (!config?.firebase) {
      toast("Google sign-in needs Firebase configured. Enter your email below to continue.", "info");
      return;
    }
    attempt("google", async () => {
      const fb = await import("@/lib/auth/firebase-client");
      await startSession(fb, await fb.firebaseSignInWithProvider("google"));
    });
  }

  return (
    <Panel as="main" className="w-full max-w-[440px] animate-rise md:p-8">
      <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-ink-1">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
      <p className="mt-1 text-ink-2">{mode === "signin" ? "Sign in to your MagickBook workspace." : "Start keeping your book in MagickBook."}</p>

      {canSignIn ? (
        <>
        <SegmentedControl
          aria-label="Sign in or sign up"
          className="mt-6 flex w-full"
          value={mode}
          onChange={setMode}
          options={[
            { value: "signin", label: "Sign in" },
            { value: "signup", label: "Sign up" },
          ]}
        />

        <Button variant="secondary" size="lg" className="mt-5 w-full" loading={busy === "google"} onClick={handleGoogle}>
          <GoogleMark /> Continue with Google
        </Button>

        <div className="my-5 flex items-center gap-3 text-[12px] text-ink-3">
          <span className="h-px flex-1 bg-line" aria-hidden /> or with email <span className="h-px flex-1 bg-line" aria-hidden />
        </div>

        <form onSubmit={handleEmail} className="space-y-3.5">
          <Field label="Work email" required>
            <Input type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {config?.firebase && (
            <div>
              <Label htmlFor="login-password" required>
                Password
              </Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-bar text-ink-3 hover:text-ink-1"
                >
                  {showPass ? <EyeOff className="size-4" strokeWidth={1.5} aria-hidden /> : <Eye className="size-4" strokeWidth={1.5} aria-hidden />}
                </button>
              </div>
            </div>
          )}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === "email"}>
            {mode === "signin" ? "Sign in" : "Create account"} <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
          </Button>
        </form>
        </>
      ) : (
        <p role="alert" className="mt-6 rounded-card bg-hover p-3.5 text-[13px] text-ink-2">
          <span className="font-semibold text-ink-1">Sign-in isn&apos;t set up.</span> Firebase is not configured and demo sign-in is turned off
          (ALLOW_DEMO_LOGIN=false). Ask whoever runs this workspace to configure one of them.
        </p>
      )}

      {config?.allowedDomains && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[13px] text-ink-2">
          <Lock className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
          <span>
            Only <span className="font-medium text-ink-1">{config.allowedDomains}</span> emails can sign in.
          </span>
        </p>
      )}

      {demoMode && (
        <section aria-labelledby="demo-mode" className="mt-5 rounded-card bg-hover p-3.5 text-[13px]">
          <h3 id="demo-mode" className="font-semibold text-ink-1">Demo mode is on</h3>
          <p className="mt-0.5 text-ink-2">Firebase isn&apos;t configured, so signing in is passwordless. Enter any allowed email above, or pick a demo account.</p>
          {demoAccounts.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {demoAccounts.map((a) => (
                <li key={a.email}>
                  <Button variant="secondary" className="w-full justify-between" loading={busy === a.email} onClick={() => signInWithEmail(a.email)}>
                    <span className="truncate">
                      {a.name} <span className="font-normal text-ink-3">· {a.role}</span>
                    </span>
                    <span className="hidden font-mono text-[12px] text-ink-3 sm:inline">{a.email}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="mt-6 text-center text-[12px] text-ink-3">By continuing you agree to the Terms and Privacy Policy.</p>
    </Panel>
  );
}

function GoogleMark() {
  return (
    <svg className="size-[17px]" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
