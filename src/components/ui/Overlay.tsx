"use client";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);
}

/** Centered dialog. */
export function Modal({
  open,
  onClose,
  children,
  title,
  subtitle,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };
  return <ModalInner widths={widths[size]} onClose={onClose} title={title} subtitle={subtitle}>{children}</ModalInner>;
}

function ModalInner({
  onClose,
  children,
  title,
  subtitle,
  widths,
}: {
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  widths: string;
}) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-scale-in relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-line bg-paper shadow-[var(--shadow-pop)]",
          widths,
        )}
      >
        {(title || subtitle) && (
          <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6">
            <div>
              {title && <h2 className="font-display text-[22px] font-bold leading-tight tracking-tight text-ink">{title}</h2>}
              {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="-mr-1 rounded-lg p-1.5 text-faint transition-colors hover:bg-canvas hover:text-ink" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-6 pb-6 pt-5">{children}</div>
      </div>
    </div>
  );
}

/** Right-hand slide-over drawer. */
export function Drawer({
  open,
  onClose,
  children,
  title,
  subtitle,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
}) {
  if (!open) return null;
  return <DrawerInner onClose={onClose} title={title} subtitle={subtitle}>{children}</DrawerInner>;
}

function DrawerInner({
  onClose,
  children,
  title,
  subtitle,
}: {
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
}) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50">
      <div className="animate-fade absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="animate-slide-in absolute right-0 top-0 flex h-full w-[min(94vw,520px)] flex-col border-l border-line bg-paper shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            {title && <h2 className="font-display text-[21px] font-bold leading-tight tracking-tight text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="-mr-1 rounded-lg p-1.5 text-faint transition-colors hover:bg-canvas hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
