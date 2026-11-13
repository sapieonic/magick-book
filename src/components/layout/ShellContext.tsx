"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import { DATA_CHANGED } from "@/lib/dataChanged";

export interface Shell {
  /** Top-bar DOM slots that `PageHeader` portals into. */
  titleSlot: HTMLElement | null;
  actionsSlot: HTMLElement | null;
  openPalette: () => void;
  /** Open the add-lead drawer from anywhere in the app. */
  newLead: () => void;
}

export const ShellContext = createContext<Shell | null>(null);

/** The app shell's actions. Throws outside the `(app)` segment. */
export function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used within AppShell");
  return shell;
}

/** Coalesces a burst of mutations (e.g. a bulk action) into one callback. */
const DATA_CHANGED_DEBOUNCE_MS = 150;

/**
 * Re-run `onChange` (typically a `refresh`) shortly after any successful
 * mutation made through `api`, wherever in the app it happened: the shell's
 * New drawer, a dialog, another panel. Bursts collapse into one call.
 */
export function useDataChanged(onChange: () => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ref.current(), DATA_CHANGED_DEBOUNCE_MS);
    };
    window.addEventListener(DATA_CHANGED, handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(DATA_CHANGED, handler);
    };
  }, []);
}
