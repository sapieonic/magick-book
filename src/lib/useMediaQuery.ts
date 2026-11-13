"use client";
import { useCallback, useSyncExternalStore } from "react";

/** Live `matchMedia` result. False on the server and where `matchMedia` is unavailable. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches),
    () => false,
  );
}

/** Below the `md` breakpoint (720px). */
export const PHONE_QUERY = "(max-width: 719.98px)";
