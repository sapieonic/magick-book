import Image from "next/image";
import { type CSSProperties, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ size = 32, withWordmark = false, className }: { size?: number; withWordmark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image src="/logo.png" alt="MagickBook" width={size} height={size} priority className="select-none" />
      {withWordmark && <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink-1">MagickBook</span>}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-ink-3", className)} strokeWidth={1.5} role="status" aria-label="Loading" />;
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-ink-3">
      <Loader2 className="size-6 animate-spin" strokeWidth={1.5} aria-hidden />
      <p role="status" className="text-[13px]">{label}</p>
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("skeleton rounded-bar", className)} style={style} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <h3 className="font-semibold text-ink-1">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-[13px] text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Bare glass surface. Prefer `Panel` when the section has a title or actions. */
export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn("glass rounded-panel", className)} style={style}>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 rounded-card bg-overdue-tint px-6 py-10 text-center">
      <p className="font-medium text-overdue">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="link text-[13px] font-medium">
          Try again
        </button>
      )}
    </div>
  );
}

/** Keyboard hint chip, e.g. `<KbdHint>⌘K</KbdHint>`. */
export function KbdHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn("rounded-bar border border-line-strong px-1.5 font-mono text-[12px] text-ink-3", className)}>{children}</kbd>
  );
}
