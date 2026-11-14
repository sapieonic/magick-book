"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AddLeadDrawer } from "@/components/leads/AddLeadDrawer";
import { useApi } from "@/lib/client";
import { isOpenLeadStage } from "@/lib/constants";
import type { NavSummary } from "@/lib/types";
import { CommandPalette } from "./CommandPalette";
import { MobileTabBar } from "./MobileTabBar";
import { ShellContext, useDataChanged, type Shell } from "./ShellContext";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** Funnel stages a new lead can start in from the board's `?stage=` focus (not won). */

/**
 * The authenticated app frame: glass sidebar (icon rail on tablets, tab bar on
 * phones), top bar, ⌘K palette and the global "New lead" drawer. Pages render
 * edge to edge in <main> and set the top bar through `PageHeader`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const stageParam = useSearchParams().get("stage");
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addingLead, setAddingLead] = useState(false);
  const { data: summary, refresh: refreshSummary } = useApi<NavSummary>("/api/nav");

  // Keep the sidebar counts live as the user moves around and after any change (the first load is useApi's own).
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) refreshSummary();
    mounted.current = true;
  }, [pathname, refreshSummary]);
  useDataChanged(refreshSummary);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const newLead = useCallback(() => setAddingLead(true), []);
  const shell = useMemo<Shell>(() => ({ titleSlot, actionsSlot, openPalette, newLead }), [titleSlot, actionsSlot, openPalette, newLead]);

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex min-h-dvh gap-3 p-2 md:p-3">
        <Sidebar summary={summary} />
        <div className="flex min-w-0 flex-1 flex-col gap-2 md:gap-3">
          <TopBar titleRef={setTitleSlot} actionsRef={setActionsSlot} />
          <main className="min-w-0 flex-1 max-md:pb-[calc(84px+env(safe-area-inset-bottom))]">{children}</main>
        </div>
        <MobileTabBar />
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} onNewLead={newLead} />
      {addingLead && (
        <AddLeadDrawer
          open
          onClose={() => setAddingLead(false)}
          defaultStage={pathname === "/leads" && isOpenLeadStage(stageParam) ? stageParam : undefined}
        />
      )}
    </ShellContext.Provider>
  );
}
