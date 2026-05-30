"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dashed";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "brand-gradient text-white shadow-[var(--shadow-violet)] hover:brightness-[1.06] active:brightness-95 border border-transparent",
  secondary:
    "bg-paper text-ink border border-line-strong hover:border-faint hover:bg-canvas shadow-[var(--shadow-card)]",
  ghost: "bg-transparent text-ink-soft hover:bg-violet-50 hover:text-violet-700 border border-transparent",
  danger: "bg-danger-bg text-danger border border-danger/30 hover:bg-danger hover:text-white",
  dashed:
    "bg-transparent text-ink-soft border border-dashed border-line-strong hover:border-violet-400 hover:text-violet-700",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px] gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-10 px-4 text-[13.5px] gap-2 rounded-[var(--radius-md)]",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-[var(--radius-md)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold tracking-tight transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
        "disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
});
