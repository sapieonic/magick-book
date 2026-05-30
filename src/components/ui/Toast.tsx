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
  success: "text-success",
  error: "text-danger",
  info: "text-info",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(92vw,360px)] flex-col gap-2.5">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div
              key={t.id}
              className="animate-slide-in pointer-events-auto flex items-start gap-3 rounded-[var(--radius-md)] border border-line bg-paper p-3.5 pr-3 shadow-[var(--shadow-pop)]"
            >
              <Icon className={cn("mt-0.5 size-[18px] shrink-0", TONES[t.tone])} strokeWidth={2.2} />
              <p className="flex-1 text-[13.5px] leading-snug text-ink">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="rounded-md p-0.5 text-faint transition-colors hover:text-ink"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
