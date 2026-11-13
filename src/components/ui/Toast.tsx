"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastCtx = createContext<{ toast: (message: string, tone?: ToastTone) => void }>({ toast: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };
const TONES: Record<ToastTone, string> = {
  success: "text-paid",
  error: "text-overdue",
  info: "text-accent",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-24 right-3 z-[100] flex w-[min(calc(100vw-24px),360px)] flex-col gap-2 md:bottom-5 md:right-5"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div key={t.id} className="glass-pop pointer-events-auto flex animate-rise items-start gap-2.5 rounded-card p-3">
              <Icon className={cn("mt-px size-[18px] shrink-0", TONES[t.tone])} strokeWidth={1.5} aria-hidden />
              <p className="flex-1 text-ink-1">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded-bar text-ink-3 transition-colors hover:text-ink-1"
                aria-label="Dismiss"
              >
                <X className="size-4" strokeWidth={1.5} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
