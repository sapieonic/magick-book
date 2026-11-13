"use client";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-control border border-line-strong bg-control px-2.5 text-ink-1 placeholder:text-ink-3 transition-[border-color,box-shadow] " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-tint disabled:opacity-60 " +
  "aria-[invalid=true]:border-overdue aria-[invalid=true]:focus:ring-overdue-tint";

export function Label({
  children,
  required,
  hint,
  htmlFor,
}: {
  children: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex items-baseline justify-between gap-2 text-[12px] font-medium text-ink-2">
      <span>
        {children}
        {required && <span className="ml-0.5 text-overdue" aria-hidden>*</span>}
      </span>
      {hint && <span className="font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

/**
 * Label + control + error. When the child is a single element (Input, Select,
 * Textarea…) the label is wired to it automatically via a generated id.
 */
export function Field({
  label,
  required,
  hint,
  children,
  error,
  className,
}: {
  label?: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  error?: string;
  className?: string;
}) {
  const autoId = useId();
  const child = isValidElement(children) ? (children as ReactElement<{ id?: string; "aria-invalid"?: boolean }>) : null;
  const id = child ? (child.props.id ?? autoId) : undefined;
  return (
    <div className={className}>
      {label && (
        <Label required={required} hint={hint} htmlFor={id}>
          {label}
        </Label>
      )}
      {child ? cloneElement(child, { id, "aria-invalid": child.props["aria-invalid"] ?? (error ? true : undefined) }) : children}
      {error && <p className="mt-1 text-[12px] text-overdue">{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(CONTROL, "h-[34px]", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(CONTROL, "min-h-20 resize-y py-2", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(CONTROL, "h-[34px] cursor-pointer appearance-none pr-8", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" strokeWidth={1.5} aria-hidden />
    </div>
  );
});
