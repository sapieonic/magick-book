"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, MessageCircle, Mail, MessageSquare, Eye, EyeOff, ArrowRight, Sparkles, Workflow, Receipt, Lock } from "lucide-react";
import { Logo } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";

interface AuthConfig {
  firebase: boolean;
  demo: boolean;
  firebaseConfig: Record<string, string> | null;
  allowedDomains: string | null;
}

const HIGHLIGHTS = [
  { icon: Workflow, title: "Capture & qualify leads", body: "A drag-and-drop pipeline from New to Won." },
  { icon: Sparkles, title: "Convert wins into accounts", body: "Contacts & company carry over in one click." },
  { icon: Receipt, title: "Invoices & expenses per account", body: "See true margin on every relationship." },
];

export function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const { toast } = useToast();

  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.get<AuthConfig>("/api/auth/config").then(setConfig).catch(() => setConfig({ firebase: false, demo: true, firebaseConfig: null, allowedDomains: null }));
  }, []);

  async function finish() {
    router.replace(next);
    router.refresh();
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy("email");
    try {
      if (config?.firebase) {
        const fb = await import("@/lib/auth/firebase-client");
        const idToken = await fb.firebaseSignInWithEmail(email.trim(), password, tab === "signup");
        try {
          await api.post("/api/auth/session", { idToken });
        } catch (sessionErr) {
          await fb.firebaseSignOut(); // server rejected (e.g. domain not allowed)
          throw sessionErr;
        }
      } else {
        // Demo mode — passwordless. The email picks which seeded user you are.
        await api.post("/api/auth/demo", { email: email.trim() });
      }
      await finish();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Sign-in failed", "error");
      setBusy(null);
    }
  }

  async function handleProvider(provider: "google" | "microsoft") {
    if (!config?.firebase) {
      toast("Google sign-in needs Firebase configured. Enter your email below to continue.", "info");
      return;
    }
    setBusy(provider);
    try {
      const fb = await import("@/lib/auth/firebase-client");
      const idToken = await fb.firebaseSignInWithProvider(provider);
      try {
        await api.post("/api/auth/session", { idToken });
      } catch (sessionErr) {
        await fb.firebaseSignOut(); // server rejected (e.g. domain not allowed)
        throw sessionErr;
      }
      await finish();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Sign-in failed", "error");
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ── Left: brand panel ─────────────────────────────────────────── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#1b1a1f] p-10 text-white lg:flex xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{ background: "radial-gradient(120% 90% at 15% 0%, rgba(123,63,242,0.55), transparent 55%), radial-gradient(100% 80% at 100% 100%, rgba(47,154,232,0.45), transparent 50%)" }}
        />
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "26px 26px" }} />

        <div className="relative">
          <Logo size={34} withWordmark className="[&_span]:text-white [&_.brand-text]:text-white" />
        </div>

        <div className="relative max-w-md animate-fade-up">
          <h1 className="font-display text-[40px] font-extrabold leading-[1.05] tracking-tight xl:text-[46px]">
            Your whole book of business, in one place.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            Capture leads, walk them to a win, then run the account — contacts, invoices & expenses — without leaving the app.
          </p>

          <div className="stagger mt-9 space-y-3">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="flex items-start gap-3.5 rounded-[var(--radius-md)] border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-white/10 text-white">
                  <h.icon className="size-[18px]" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[13.5px] font-semibold">{h.title}</p>
                  <p className="text-[12.5px] text-white/55">{h.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-4 text-[12px] text-white/45">
          <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" /> Call</span>
          <span className="inline-flex items-center gap-1.5"><MessageCircle className="size-3.5" /> WhatsApp</span>
          <span className="inline-flex items-center gap-1.5"><MessageSquare className="size-3.5" /> SMS</span>
          <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" /> Email</span>
        </div>
      </div>

      {/* ── Right: sign-in ────────────────────────────────────────────── */}
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px] animate-fade-up">
          <div className="mb-7 lg:hidden">
            <Logo size={30} withWordmark />
          </div>

          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-display text-[28px] font-bold tracking-tight text-ink">
              {tab === "signin" ? "Welcome back 👋" : "Create your account"}
            </h2>
          </div>
          <p className="text-[13.5px] text-muted">
            {tab === "signin" ? "Sign in to your MagickBook workspace." : "Start your whole book of business."}
          </p>

          {/* Tabs */}
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-[var(--radius-md)] border border-line bg-canvas p-1">
            {(["signin", "signup"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`h-9 rounded-[var(--radius-sm)] text-[13px] font-semibold transition-all ${
                  tab === t ? "bg-paper text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink"
                }`}
              >
                {t === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          {/* OAuth — Google only for now */}
          <div className="mt-5 space-y-2.5">
            <Button variant="secondary" size="lg" className="w-full" loading={busy === "google"} onClick={() => handleProvider("google")}>
              <GoogleMark /> Continue with Google
            </Button>
          </div>

          <div className="my-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-faint">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmail} className="space-y-3.5">
            <Field label="Work email" required>
              <Input type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {config?.firebase && (
              <Field label="Password" required hint={<button type="button" onClick={() => setShowPass((s) => !s)} className="inline-flex items-center gap-1 hover:text-ink">{showPass ? <EyeOff className="size-3" /> : <Eye className="size-3" />} {showPass ? "hide" : "show"}</button>}>
                <Input type={showPass ? "text" : "password"} autoComplete={tab === "signup" ? "new-password" : "current-password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === "email"}>
              {tab === "signin" ? "Sign in" : "Create account"} <ArrowRight className="size-4" />
            </Button>
          </form>

          {config?.allowedDomains && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[12px] text-muted">
              <Lock className="size-3.5 text-faint" />
              Only <span className="font-semibold text-ink-soft">{config.allowedDomains}</span> emails can sign in.
            </p>
          )}

          {config && !config.firebase && (
            <div className="mt-5 rounded-[var(--radius-md)] border border-dashed border-violet-200 bg-violet-50/60 p-3.5 text-[12.5px] leading-relaxed text-violet-800">
              <p className="font-semibold">Demo mode is on.</p>
              <p className="mt-0.5 text-violet-700/80">
                Firebase isn&apos;t configured, so signing in is passwordless — enter any allowed email above to continue.
              </p>
            </div>
          )}

          <p className="mt-6 text-center text-[11.5px] text-faint">
            By continuing you agree to the Terms & Privacy Policy.
          </p>
        </div>
      </div>
    </div>
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
