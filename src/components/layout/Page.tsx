import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page body: a full-width vertical stack of panels with the shell's 12px gap.
 * Pages fill the viewport edge to edge; there is no centred max-width.
 */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-col gap-2 md:gap-3", className)}>{children}</div>;
}

/**
 * Main region plus a context rail. The rail is a 400px right column from
 * 1280px up; below that it drops under the main region (two columns on
 * tablets, one on phones).
 */
export function PageSplit({
  children,
  rail,
  railLabel,
  className,
}: {
  children: ReactNode;
  rail?: ReactNode;
  /** Accessible name for the rail, e.g. "Receivables". */
  railLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 items-start gap-2 md:gap-3", rail && "xl:grid-cols-[minmax(0,1fr)_400px]", className)}>
      <div className="flex min-w-0 flex-col gap-2 md:gap-3">{children}</div>
      {rail && (
        <aside aria-label={railLabel} className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 xl:flex xl:flex-col">
          {rail}
        </aside>
      )}
    </div>
  );
}
