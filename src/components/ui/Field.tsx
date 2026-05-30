"use client";
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const baseInput =
  "w-full rounded-[var(--radius-md)] border border-line-strong bg-paper px-3.5 text-[14px] text-ink placeholder:text-faint " +
  "transition-all duration-150 focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:opacity-60";

export function Label({ children, required, hint }: { children: ReactNode; required?: boolean; hint?: ReactNode }) {
  return (
    <label className="mb-1.5 flex items-baseline justify-between text-[12.5px] font-semibold text-ink-soft">
      <span>
        {children}
        {required && <span className="ml-0.5 text-violet-500">*</span>}
      </span>
      {hint && <span className="text-[11px] font-normal text-faint">{hint}</span>}
    </label>
  );
}

export function Field({ label, required, hint, children, error }: { label?: ReactNode; required?: boolean; hint?: ReactNode; children: ReactNode; error?: string }) {
  return (
    <div>
      {label && (
        <Label required={required} hint={hint}>
          {label}
        </Label>
      )}
      {children}
      {error && <p className="mt-1 text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(baseInput, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(baseInput, "min-h-[84px] resize-y py-2.5 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(baseInput, "h-10 cursor-pointer appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
});
