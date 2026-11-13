"use client";
import { Sun, Moon, Monitor } from "lucide-react";
import { SegmentedControl, type SegmentOption } from "@/components/ui/SegmentedControl";
import { useTheme, type ThemePref } from "./ThemeProvider";

const OPTIONS: SegmentOption<ThemePref>[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

/** Light / Dark / Auto switch, shown in the user menu. */
export function ThemeToggle({ className }: { className?: string }) {
  const { pref, setPref } = useTheme();
  return <SegmentedControl aria-label="Theme" options={OPTIONS} value={pref} onChange={setPref} size="sm" className={className} />;
}
