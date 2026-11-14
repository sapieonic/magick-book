"use client";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * "More actions" button with a small menu. Arrow keys move between items,
 * Escape or a click outside closes it and focus returns to the button.
 */
export function OverflowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    nodes[(i + step + nodes.length) % nodes.length]?.focus();
  }

  return (
    <>
      <Button
        ref={buttonRef}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="w-[34px] px-0 max-md:w-11"
      >
        <MoreHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
      </Button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        id={menuId}
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="min-w-48 p-1"
      >
        {items.map((item, i) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            autoFocus={i === 0}
            onClick={() => {
              setOpen(false);
              buttonRef.current?.focus();
              item.onSelect();
            }}
            className={cn("flex h-8 w-full items-center rounded-bar px-2.5 text-left hover:bg-hover max-md:h-11", item.danger ? "text-overdue" : "text-ink-1")}
          >
            {item.label}
          </button>
        ))}
      </Popover>
    </>
  );
}
