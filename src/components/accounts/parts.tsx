import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/Misc";
import { cn } from "@/lib/utils";

/** Loading placeholder for a ledger table. */
export function RowsSkeleton({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="flex flex-col gap-3 py-2" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6" style={{ width: `${92 - i * 7}%` }} />
      ))}
    </div>
  );
}

/** Text button that reads as a link: panel header actions such as "Upload" or "All contacts". */
export function LinkButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn("link text-[13px]", className)} {...props} />;
}

/** Hairline list of short-date + text rows (reminders, recent activity). */
export function DatedList({ items, empty }: { items: { key: string; date: string; text: ReactNode }[]; empty: string }) {
  if (items.length === 0) return <p className="py-[9px] text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul>
      {items.map((it) => (
        <li key={it.key} className="grid grid-cols-[64px_minmax(0,1fr)] border-b border-line py-[9px] last:border-b-0">
          <span className="tnum text-[13px] text-ink-3">{it.date}</span>
          <span className="min-w-0 break-words">{it.text}</span>
        </li>
      ))}
    </ul>
  );
}
