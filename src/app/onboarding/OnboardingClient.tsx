"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Field";
import { Logo } from "@/components/ui/Misc";
import { Panel } from "@/components/ui/Panel";
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-3 py-10">
      <Logo />

      <Panel as="main" className="w-full max-w-[560px] animate-rise md:px-10 md:py-9">
        <form onSubmit={create}>
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ink-1 md:text-[28px]">
            Welcome{firstName ? `, ${firstName}` : ""}. Let&apos;s set up your book.
          </h1>
          <p className="mt-2 text-ink-2">Name your workspace and you get a working pipeline straight away.</p>

          <div className="mt-7 space-y-6 border-t border-line-strong pt-6">
            <Field label="What's your business called?" required>
              <Input autoFocus placeholder="e.g. Acme Logistics" value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-[15px]" />
            </Field>

            <fieldset>
              <legend className="mb-2 text-[12px] font-medium text-ink-2">
                What do you mostly do? <span className="font-normal text-ink-3">Optional</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {FOCUSES.map((f) => {
                  const active = focuses.includes(f);
                  const Icon = active ? Check : Plus;
                  return (
                    <button
                      type="button"
                      key={f}
                      aria-pressed={active}
                      onClick={() => toggle(f)}
                      className={cn(
                        "inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                        active ? "border-accent bg-accent-tint text-accent" : "border-line-strong bg-control text-ink-2 hover:text-ink-1",
                      )}
                    >
                      <Icon className="size-4" strokeWidth={1.5} aria-hidden />
                      {f}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" variant="primary" size="lg" loading={busy}>
              Create my workspace <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
            </Button>
            <span className="text-[13px] text-ink-3">Takes about ten seconds</span>
          </div>
        </form>
      </Panel>
    </div>
  );
}
