"use client";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Open dialogs, bottom → top. Only the topmost answers Escape and traps Tab. */
const stack: symbol[] = [];

/**
 * Modal-dialog behaviour for a container: Escape to close, Tab focus trap,
 * page scroll lock, initial focus, and focus restore on unmount. Attach the
 * returned ref to the dialog element (give it `tabIndex={-1}`).
 */
export function useDialog<T extends HTMLElement>(onClose: () => void): RefObject<T | null> {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const id = Symbol("dialog");
    const node = ref.current;
    const restore = document.activeElement as HTMLElement | null;
    stack.push(id);
    document.body.style.overflow = "hidden";
    if (node && !node.contains(document.activeElement)) node.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id || !node) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first || !node.contains(active)) {
        e.preventDefault();
        (first ?? node).focus();
      } else if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(id), 1);
      if (stack.length === 0) document.body.style.overflow = "";
      restore?.focus?.();
    };
  }, []);

  return ref;
}

/**
 * Renders children into <body>. Overlays must escape glass panels, whose
 * backdrop-filter would otherwise become the containing block for `fixed`.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

export function Scrim({ onClose }: { onClose: () => void }) {
  return <div className="absolute inset-0 animate-fade bg-scrim" onClick={onClose} aria-hidden />;
}

function Heading({ id, title, subtitle, onClose }: { id: string; title?: ReactNode; subtitle?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4">
      <div className="min-w-0">
        {title && <h2 id={id} className="text-[16px] font-semibold text-ink-1">{title}</h2>}
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="-mr-1.5 -mt-1 flex size-8 shrink-0 max-md:size-11 items-center justify-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink-1"
        aria-label="Close"
      >
        <X className="size-[18px]" strokeWidth={1.5} />
      </button>
    </div>
  );
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
}

const MODAL_WIDTHS = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };

/** Centred glass dialog. */
export function Modal({ open, size = "md", ...rest }: OverlayProps & { size?: keyof typeof MODAL_WIDTHS }) {
  if (!open) return null;
  return (
    <Portal>
      <ModalInner width={MODAL_WIDTHS[size]} {...rest} />
    </Portal>
  );
}

function ModalInner({ onClose, children, title, subtitle, width }: Omit<OverlayProps, "open"> & { width: string }) {
  const ref = useDialog<HTMLDivElement>(onClose);
  const headingId = useId();
  const hasHeading = Boolean(title || subtitle);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6">
      <Scrim onClose={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? headingId : undefined}
        tabIndex={-1}
        className={cn("glass-pop relative flex max-h-[90dvh] w-full animate-rise flex-col overflow-hidden rounded-panel outline-none", width)}
      >
        {hasHeading && (
          <div className="px-6 pt-5">
            <Heading id={headingId} title={title} subtitle={subtitle} onClose={onClose} />
          </div>
        )}
        <div className={cn("overflow-y-auto px-6 pb-6", hasHeading ? "pt-4" : "pt-6")}>{children}</div>
      </div>
    </div>
  );
}

/** Right-hand glass slide-over. */
export function Drawer({ open, ...rest }: OverlayProps) {
  if (!open) return null;
  return (
    <Portal>
      <DrawerInner {...rest} />
    </Portal>
  );
}

function DrawerInner({ onClose, children, title, subtitle }: Omit<OverlayProps, "open">) {
  const ref = useDialog<HTMLDivElement>(onClose);
  const headingId = useId();
  return (
    <div className="fixed inset-0 z-50">
      <Scrim onClose={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? headingId : undefined}
        tabIndex={-1}
        className="glass-pop absolute inset-y-2 right-2 flex w-[min(calc(100vw-16px),520px)] animate-slide-in flex-col rounded-panel outline-none"
      >
        <div className="border-b border-line-strong px-6 py-4">
          <Heading id={headingId} title={title} subtitle={subtitle} onClose={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
