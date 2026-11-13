"use client";
import { Fragment, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ShellContext } from "./ShellContext";

interface Crumb {
  label: ReactNode;
  href: string;
}

/**
 * Sets the top bar for the current page. Renders nothing in place: the title
 * (with optional breadcrumb trail and inline `children`) and the `actions` are
 * portalled into the shell's top-bar slots, so they stay part of the page's
 * React tree. Outside the shell (tests, standalone pages) it falls back to an
 * inline glass header.
 */
export function PageHeader({
  title,
  breadcrumb,
  actions,
  children,
}: {
  title?: ReactNode;
  /** Parent pages, outermost first; the `title` is the current page. */
  breadcrumb?: Crumb[];
  /** Page-level buttons, placed on the right before the shell's "New". */
  actions?: ReactNode;
  /** Extra inline content after the title (status chips, view switchers). */
  children?: ReactNode;
}) {
  const shell = useContext(ShellContext);

  const heading = (
    <>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-ink-3 max-md:hidden">
          {breadcrumb.map((c) => (
            <Fragment key={c.href}>
              <Link href={c.href} className="hover:text-ink-1">
                {c.label}
              </Link>
              <span aria-hidden>/</span>
            </Fragment>
          ))}
        </nav>
      )}
      {title != null && <h1 className="min-w-0 truncate text-[16px] font-semibold text-ink-1">{title}</h1>}
      {children}
    </>
  );

  if (!shell) {
    return (
      <header className="glass flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 rounded-panel px-4 py-2.5">
        {heading}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>
    );
  }
  return (
    <>
      {shell.titleSlot && createPortal(heading, shell.titleSlot)}
      {actions && shell.actionsSlot && createPortal(actions, shell.actionsSlot)}
    </>
  );
}
