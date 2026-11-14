import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Tag } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { DEFAULT_LEAD_CATEGORY, formatCategoryLabel } from "@/lib/constants";
import { Staleness } from "@/components/ui/Staleness";
import { cn, plural } from "@/lib/utils";
import type { LeadDTO } from "@/lib/types";

/** The lead's name as a link stretched over the whole card, so the card is one target. */
function NameLink({ lead, dragging, describedBy }: { lead: LeadDTO; dragging?: boolean; describedBy?: string }) {
  if (dragging) return <span className="truncate font-medium">{lead.name}</span>;
  return (
    <Link
      href={`/leads/${lead.id}`}
      draggable={false}
      aria-describedby={describedBy}
      className="truncate font-medium text-ink-1 after:absolute after:inset-0 after:rounded-[inherit]"
    >
      {lead.name}
    </Link>
  );
}

/**
 * Board card: name and value, company, then category, note count, staleness
 * and the owner's initials.
 */
export function LeadCard({ lead, dragging, describedBy }: { lead: LeadDTO; dragging?: boolean; describedBy?: string }) {
  const subtitle = [lead.title, lead.company].filter(Boolean).join(" · ");
  const classified = !!lead.category && lead.category !== DEFAULT_LEAD_CATEGORY;
  const meta = [classified && formatCategoryLabel(lead.category), lead.commentCount > 0 && plural(lead.commentCount, "note")]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={cn(
        "glass-card relative rounded-card px-3 py-2.5 transition-colors hover:border-line-strong has-[a:focus-visible]:border-accent",
        dragging && "cursor-grabbing shadow-pop",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <NameLink lead={lead} dragging={dragging} describedBy={describedBy} />
        <Money value={lead.estValue} compact className="shrink-0 font-medium" />
      </div>
      {subtitle && <p className="truncate text-[13px] text-ink-3">{subtitle}</p>}
      {lead.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {lead.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-ink-3">
        <span className="min-w-0 truncate">{meta}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Staleness since={lead.lastActivityAt} />
          {lead.ownerName && (
            <>
              <span className="sr-only">, owner {lead.ownerName}</span>
              <Avatar name={lead.ownerName} size={24} />
            </>
          )}
        </span>
      </div>
    </article>
  );
}

/** Compact Won row: name and value over company and age, with a link to the account it became. */
export function LeadRow({ lead, dragging, describedBy }: { lead: LeadDTO; dragging?: boolean; describedBy?: string }) {
  return (
    <div className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-b border-line py-2 text-[13px]">
      <NameLink lead={lead} dragging={dragging} describedBy={describedBy} />
      <Money value={lead.estValue} compact className="text-right text-[14px] font-medium" />
      <span className="truncate text-ink-3">
        {lead.company && <>{lead.company} · </>}
        <Staleness since={lead.lastActivityAt} plain />
      </span>
      {lead.convertedAccountId && !dragging ? (
        <Link href={`/accounts/${lead.convertedAccountId}`} draggable={false} className="link relative z-[1] text-right">
          View account
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
