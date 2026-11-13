"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink-1 text-on-ink hover:opacity-90",
  secondary: "border border-line-strong bg-control text-ink-1 hover:bg-hover",
  ghost: "font-normal text-ink-2 hover:bg-hover hover:text-ink-1",
  danger: "border border-line-strong bg-control text-overdue hover:bg-overdue-tint",
};

/** Phones (`max-md`) get taller controls: 44px touch targets, 36px for dense row actions. */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-[13px] max-md:h-9",
  md: "h-[34px] gap-1.5 px-3.5 max-md:h-11",
  lg: "h-11 gap-2 px-4 text-[15px]",
};

/** Class string for anything that should look like a button (e.g. a `<Link>`). */
export function buttonClasses({
  variant = "secondary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    "inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-control font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

/** Text button that reads as a link: panel header actions such as "Upload" or "Show all". */
export function LinkButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  // On phones the text keeps its size but the tap area grows to ~44px.
  return <button type="button" className={cn("link max-md:relative max-md:after:absolute max-md:after:-inset-3", className)} {...props} />;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden />}
      {children}
    </button>
  );
});
