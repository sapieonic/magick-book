"use client";
import { createContext, useContext, useEffect, useRef } from "react";

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

const LEADS_CHANGED = "mb:leads-changed";

/** Tell every listening page that a lead was created outside of it (shell "New"). */
export function announceLeadsChanged() {
  window.dispatchEvent(new Event(LEADS_CHANGED));
}

/** Re-run `onChange` (typically a list `refresh`) when the shell creates a lead. */
export function useLeadsChanged(onChange: () => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(LEADS_CHANGED, handler);
    return () => window.removeEventListener(LEADS_CHANGED, handler);
  }, []);
}
