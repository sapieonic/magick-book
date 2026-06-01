"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Modal } from "./Overlay";
import { Button } from "./Button";

type ConfirmTone = "danger" | "default";

export interface ConfirmOptions {
  title: string;
  /** Body copy explaining the consequences of the action. */
  description?: ReactNode;
  /** Label for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** "danger" styles the confirm button as destructive. */
  tone?: ConfirmTone;
}

type Resolver = (ok: boolean) => void;

const ConfirmCtx = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);

/**
 * Promise-based confirmation. Replaces the native window.confirm() with an
 * on-brand modal. Usage:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Archive this lead?", tone: "danger" }))) return;
 */
export function useConfirm() {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setBusy(false);
      setOpts(next);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  const tone = opts?.tone ?? "default";
  const Icon = tone === "danger" ? AlertTriangle : Info;

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!opts} onClose={() => settle(false)}>
        {opts && (
          <div className="flex gap-4">
            <div
              className={
                tone === "danger"
                  ? "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-danger-bg text-danger"
                  : "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-500"
              }
            >
              <Icon className="size-[22px]" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[19px] font-bold leading-tight tracking-tight text-ink">{opts.title}</h2>
              {opts.description && (
                <div className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{opts.description}</div>
              )}
              <div className="mt-5 flex justify-end gap-2.5">
                <Button variant="ghost" onClick={() => settle(false)} disabled={busy}>
                  {opts.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  autoFocus
                  variant={tone === "danger" ? "danger" : "primary"}
                  onClick={() => {
                    setBusy(true);
                    settle(true);
                  }}
                  loading={busy}
                >
                  {opts.confirmLabel ?? "Confirm"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}
