"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePref = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "mb-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Inline script (no-flash). Runs before paint in <head> to set
 * `data-theme` on <html> from the stored preference (or the OS setting),
 * so the first frame already matches and there's no light→dark flash.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');var m=window.matchMedia('${DARK_QUERY}').matches;var r=(p==='dark'||((!p||p==='system')&&m))?'dark':'light';document.documentElement.dataset.theme=r;}catch(e){}})();`;

interface ThemeCtx {
  /** User's saved choice: light, dark, or follow system. */
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx>({ pref: "system", setPref: () => {} });

export function useTheme() {
  return useContext(Ctx);
}

/** The saved preference; "system" on the server or when storage is unavailable. */
function storedPref(): ThemePref {
  if (typeof window === "undefined") return "system";
  try {
    const p = localStorage.getItem(THEME_STORAGE_KEY);
    return p === "light" || p === "dark" ? p : "system";
  } catch {
    return "system";
  }
}

/** Set the theme on <html> and point the browser chrome (`theme-color`) at the matching ground. */
function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const ground = getComputedStyle(root).getPropertyValue("--color-ground").trim();
  if (!ground) return;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", ground));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy, so the first effect applies the saved choice rather than the OS one.
  const [pref, setPrefState] = useState<ThemePref>(storedPref);

  // Apply to <html> and keep in sync with the OS when on "system".
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const apply = () => applyTheme(pref === "system" ? (mq.matches ? "dark" : "light") : pref);
    apply();
    if (pref !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* storage may be unavailable (private mode) — fall back to in-memory */
    }
  }, []);

  return <Ctx.Provider value={{ pref, setPref }}>{children}</Ctx.Provider>;
}
