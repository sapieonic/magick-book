import Image from "next/image";
import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ size = 32, withWordmark = false, className }: { size?: number; withWordmark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image src="/logo.png" alt="MagickBook" width={size} height={size} priority className="select-none" />
      {withWordmark && (
        <span className="font-display text-[19px] font-extrabold tracking-tight text-ink">
          Magick<span className="brand-text">Book</span>
        </span>
      )}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-violet-500", className)} />;
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-muted">
      <Spinner className="size-6" />
      <p className="text-[13px]">{label}</p>
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("skeleton rounded-[var(--radius-sm)]", className)} style={style} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-paper/60 px-6 py-14 text-center">
      {icon && (
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-500">{icon}</div>
      )}
      <h3 className="font-display text-[16px] font-bold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-lg)] border border-line bg-paper shadow-[var(--shadow-card)]", className)}>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-danger/20 bg-danger-bg/40 px-6 py-12 text-center">
      <p className="text-[13.5px] font-medium text-danger">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-[12.5px] font-semibold text-violet-600 underline-offset-2 hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}
