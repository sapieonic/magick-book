"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "mb-theme";

/**
 * Inline script (no-flash). Runs before paint in <head> to set
 * `data-theme` on <html> from the stored preference (or the OS setting),
 * so the first frame already matches and there's no light→dark flash.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=(p==='dark'||((!p||p==='system')&&m))?'dark':'light';document.documentElement.dataset.theme=r;}catch(e){}})();`;

interface ThemeCtx {
  /** User's saved choice: light, dark, or follow system. */
  pref: ThemePref;
  /** The theme actually applied right now. */
  resolved: ResolvedTheme;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx>({ pref: "system", resolved: "light", setPref: () => {} });

export function useTheme() {
  return useContext(Ctx);
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolve(pref: ThemePref): ResolvedTheme {
  return pref === "system" ? systemTheme() : pref;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // Hydrate from storage / the value the init script already applied.
  useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as ThemePref | null) ?? "system";
    setPrefState(stored);
    setResolved(resolve(stored));
  }, []);

  // Apply to <html> and keep in sync with the OS when on "system".
  useEffect(() => {
    const r = resolve(pref);
    setResolved(r);
    document.documentElement.dataset.theme = r;

    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = mq.matches ? "dark" : "light";
      setResolved(next);
      document.documentElement.dataset.theme = next;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* storage may be unavailable (private mode) — fall back to in-memory */
    }
  }, []);

  return <Ctx.Provider value={{ pref, resolved, setPref }}>{children}</Ctx.Provider>;
}
