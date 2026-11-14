"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * A modifier shortcut as the platform writes it: "⌘K" / "⌘ Enter" on Apple
 * devices, "Ctrl K" / "Ctrl Enter" elsewhere. The server render (and the first
 * client render) uses the Apple form, so hydration stays stable.
 */
export function useShortcutLabel(key: string): string {
  const apple = useSyncExternalStore(noop, isApple, () => true);
  if (!apple) return `Ctrl ${key}`;
  return key.length === 1 ? `⌘${key}` : `⌘ ${key}`;
}
