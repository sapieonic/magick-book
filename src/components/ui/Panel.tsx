import { type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Glass content section. With `title` it renders a header row: title, optional
 * muted `meta` beside it, and `actions` on the right; `ruled` draws the strong
 * hairline under the header (list panels).
 */
export function Panel({
  title,
  meta,
  actions,
  ruled,
  as: Tag = "section",
  className,
  children,
  ...props
}: {
  title?: ReactNode;
  /** Muted text right after the title, e.g. a count or total. */
  meta?: ReactNode;
  actions?: ReactNode;
  ruled?: boolean;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Tag className={cn("glass min-w-0 rounded-panel p-4 md:px-6 md:py-[22px]", className)} {...props}>
      {(title || actions) && (
        <div
          className={cn(
            "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
            ruled ? "border-b border-line-strong pb-1.5" : "mb-2.5",
          )}
        >
          <h2 className="text-[14px] font-semibold text-ink-1">
            {title}
            {meta != null && (
              <>
                {" "}
                <span className="tnum font-normal text-ink-3">{meta}</span>
              </>
            )}
          </h2>
          {actions && <div className="flex items-center gap-2 text-[13px] text-ink-2">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
