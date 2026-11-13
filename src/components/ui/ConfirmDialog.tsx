"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Modal } from "./Overlay";
import { Button } from "./Button";

interface ConfirmOptions {
  title: string;
  /** Body copy explaining the consequences of the action. */
  description?: ReactNode;
  /** Label for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** "danger" styles the confirm button as destructive. */
  tone?: "danger" | "default";
}

const ConfirmCtx = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);

/**
 * Promise-based confirmation, replacing window.confirm():
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Archive this lead?", tone: "danger" }))) return;
 */
export function useConfirm() {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(next);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!opts} onClose={() => settle(false)} title={opts?.title} size="sm">
        {opts && (
          <>
            {opts.description && <div className="text-ink-2">{opts.description}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => settle(false)}>
                {opts.cancelLabel ?? "Cancel"}
              </Button>
              <Button autoFocus variant={opts.tone === "danger" ? "danger" : "primary"} onClick={() => settle(true)}>
                {opts.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}
