"use client";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { KbdHint } from "@/components/ui/Misc";
import { useShortcutLabel } from "@/lib/useShortcutLabel";
import { useShell } from "./ShellContext";
import { UserMenu } from "./UserMenu";

/**
 * Glass top bar. Pages fill the title and action slots through `PageHeader`;
 * the bar itself owns the command bar and the ink "New" button (on phones: a
 * search icon and the user menu, since "New" lives in the tab bar).
 */
export function TopBar({
  titleRef,
  actionsRef,
}: {
  titleRef: (el: HTMLElement | null) => void;
  actionsRef: (el: HTMLElement | null) => void;
}) {
  const { openPalette, newLead } = useShell();
  const shortcut = useShortcutLabel("K");

  return (
    <header className="glass sticky top-2 z-20 flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 rounded-panel py-2 pl-4 pr-1 md:top-3 md:py-2.5 md:pl-[22px] md:pr-3.5">
      <div ref={titleRef} className="flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-x-3 gap-y-2 max-md:basis-20" />

      <button
        type="button"
        onClick={openPalette}
        className="hidden h-[34px] min-w-0 max-w-[440px] flex-[1_1_200px] items-center gap-2 rounded-control border border-line-strong bg-control px-2.5 text-left text-ink-3 transition-colors hover:bg-hover md:flex"
      >
        <Search className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden />
        <span className="min-w-0 flex-1 truncate">Search or jump to…</span>
        <KbdHint>{shortcut}</KbdHint>
      </button>

      <div className="flex items-center justify-end gap-2 md:flex-[1_0_auto]">
        <div ref={actionsRef} className="flex flex-wrap items-center justify-end gap-2 empty:hidden md:flex-nowrap" />
        <button type="button" onClick={openPalette} aria-label="Search or jump to" className="flex size-11 items-center justify-center rounded-control text-ink-1 md:hidden">
          <Search className="size-[22px]" strokeWidth={1.5} aria-hidden />
        </button>
        <Button variant="primary" onClick={newLead} aria-label="New lead" className="pl-2.5 max-md:hidden">
          <Plus className="size-[18px]" strokeWidth={1.5} aria-hidden /> New
        </Button>
        <UserMenu variant="topbar" className="md:hidden" />
      </div>
    </header>
  );
}
