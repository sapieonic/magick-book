"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { FOCUSABLE } from "./Overlay";

/** Space between the trigger and the popover, and the popover and the viewport edge. */
const GAP = 6;
const EDGE = 8;

type Placement = { top: number; left: number };

/**
 * Where a popover of `width` x `height` goes for a trigger at `anchor`: under
 * it, left edges aligned. It flips to the trigger's right edge when it would
 * overflow the viewport on the right, and above the trigger when it would
 * overflow at the bottom and there is more room above.
 */
function place(anchor: DOMRect, width: number, height: number): Placement {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  let left = anchor.left;
  if (left + width > vw - EDGE) left = anchor.right - width;
  left = Math.max(EDGE, Math.min(left, vw - EDGE - width));
  let top = anchor.bottom + GAP;
  if (top + height > vh - EDGE && anchor.top > vh - anchor.bottom) top = Math.max(EDGE, anchor.top - GAP - height);
  return { top, left };
}

/**
 * Non-modal popover (menus, filters) anchored to its trigger. It portals to
 * <body> with fixed positioning, because glass panels' `backdrop-filter`
 * starts a stacking context that the next panel would paint over. It follows
 * the trigger on scroll and resize, sits above panels and the sidebar but
 * below dialogs and toasts, closes on an outside click (the trigger and the
 * popover count as inside), and on Escape returns focus to the trigger.
 * Tabbing out of either end closes it and carries on from the trigger.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  className,
  style,
  onKeyDown,
  children,
  ...props
}: {
  open: boolean;
  onClose: () => void;
  /** The trigger: positions the popover and gets focus back on Escape. */
  anchorRef: RefObject<HTMLElement | null>;
} & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const node = ref.current;
    if (!anchor || !node) return;
    const next = place(anchor.getBoundingClientRect(), node.offsetWidth, node.offsetHeight);
    setPlacement((p) => (p && p.top === next.top && p.left === next.left ? p : next));
  }, [anchorRef]);

  // Measure before paint, and again whenever the content re-renders (its size may change).
  useLayoutEffect(() => {
    if (open) reposition();
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchorRef.current?.contains(target)) closeRef.current();
    };
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeRef.current();
      anchorRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    // Capture, so a popover inside a dialog closes before the dialog sees the Escape.
    document.addEventListener("keydown", onEscape, true);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape, true);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, anchorRef, reposition]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(e);
    if (e.key !== "Tab" || e.defaultPrevented) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0);
    const edge = e.shiftKey ? items[0] : items[items.length - 1];
    if (items.length > 0 && document.activeElement !== edge) return;
    // Leaving the popover: close and continue the tab order from the trigger
    // (Shift+Tab lands on the trigger itself; Tab moves on past it).
    closeRef.current();
    anchorRef.current?.focus();
    if (e.shiftKey) e.preventDefault();
  }

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      onKeyDown={handleKeyDown}
      // Until measured it sits at the origin, still visible so an `autoFocus` child can take focus; the
      // layout effect places it before the first paint.
      style={{ ...style, ...(placement ?? { top: 0, left: 0 }) }}
      className={cn("fixed z-40 animate-rise rounded-card border border-line-strong bg-surface shadow-pop", className)}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
}
