"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Plus } from "lucide-react";
import { Logo } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

const FOCUSES = ["Sales calls", "Collections", "Support", "Onboarding", "Renewals"];

export function OnboardingClient({ firstName }: { firstName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [focuses, setFocuses] = useState<string[]>(["Sales calls"]);
  const [busy, setBusy] = useState(false);

  function toggle(f: string) {
    setFocuses((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast("Give your workspace a name first.", "error");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/workspace", { name: name.trim(), businessTypes: focuses });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create workspace", "error");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-xl animate-fade-up">
        <div className="mb-8 flex justify-center">
          <Logo size={30} withWordmark />
        </div>

        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-line bg-paper shadow-[var(--shadow-card)]">
          <div className="px-8 pt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Step 1 of 3</p>
            <div className="mt-2.5 flex gap-1.5">
              <span className="h-1.5 flex-1 rounded-full brand-gradient" />
              <span className="h-1.5 flex-1 rounded-full bg-line" />
              <span className="h-1.5 flex-1 rounded-full bg-line" />
            </div>
          </div>

          <form onSubmit={create} className="px-8 pb-8 pt-6">
            <h1 className="font-display text-[27px] font-bold leading-tight tracking-tight text-ink">
              Welcome{firstName ? `, ${firstName}` : ""} — let&apos;s set up your book 📒
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              No jargon, no empty dashboards. Answer one thing and we&apos;ll get you a working pipeline.
            </p>

            <div className="mt-7 space-y-5">
              <Field label="What's your business called?" required>
                <Input autoFocus placeholder="e.g. Acme Logistics" value={name} onChange={(e) => setName(e.target.value)} className="h-12 text-[15px]" />
              </Field>

              <div>
                <p className="mb-2 text-[12.5px] font-semibold text-ink-soft">
                  What do you mostly do? <span className="font-normal text-faint">(optional)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {FOCUSES.map((f) => {
                    const active = focuses.includes(f);
                    return (
                      <button
                        type="button"
                        key={f}
                        onClick={() => toggle(f)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-all",
                          active
                            ? "border-violet-300 bg-violet-50 text-violet-700"
                            : "border-line-strong bg-paper text-ink-soft hover:border-faint",
                        )}
                      >
                        {active ? <Check className="size-3.5" /> : <Plus className="size-3.5 opacity-50" />}
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <Button type="submit" variant="primary" size="lg" loading={busy}>
                Create my workspace <ArrowRight className="size-4" />
              </Button>
              <span className="text-[12.5px] text-faint">takes 10 seconds</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
