"use client";
import type { CSSProperties } from "react";
import { Phone, Mail, MessageSquare, CornerDownRight } from "lucide-react";
import { formatINRCompact, initials, avatarTint, valueTier, relativeTime, absoluteTime, cn } from "@/lib/utils";
import type { LeadDTO } from "@/lib/types";

const TAG_TINT: Record<string, string> = {
  hot: "bg-danger-bg text-danger",
  called: "bg-info-bg text-info",
  warm: "bg-warn-bg text-warn",
};

/** Presentational lead card used on the board. */
export function LeadCard({ lead, dragging }: { lead: LeadDTO; dragging?: boolean }) {
  const tint = avatarTint(lead.ownerName || lead.name);
  // Colour the card by deal size — one hue per ₹25k band (see --color-tier* tokens).
  const tier = valueTier(lead.estValue);
  const tierStyle =
    tier >= 0
      ? ({
          "--tier": `var(--color-tier${tier})`,
          "--tier-bg": `var(--color-tier${tier}-bg)`,
          "--tier-shadow": `color-mix(in srgb, var(--color-tier${tier}) 10%, transparent)`,
          borderLeftColor: "var(--tier)",
          borderLeftWidth: "3px",
        } as CSSProperties)
      : undefined;

  const hasTags = lead.tags.length > 0;
  const hasValue = lead.estValue > 0;
  // The footer carries at-a-glance signals: comment count, conversion, last touch.
  const showFooter = lead.commentCount > 0 || !!lead.convertedAccountId || !!lead.lastActivityAt;

  return (
    <div
      style={tierStyle}
      className={cn(
        "group relative rounded-[var(--radius-lg)] border border-line bg-paper/95 p-4 shadow-sm transition-all duration-200 dark:bg-canvas/40 dark:backdrop-blur-md",
        dragging
          ? "rotate-[2deg] scale-[1.03] shadow-[0_12px_24px_rgba(0,0,0,0.15)] ring-2 ring-violet-400 z-50 cursor-grabbing"
          : tier >= 0
            ? "hover:-translate-y-1 hover:shadow-md hover:shadow-[var(--tier-shadow)] hover:ring-1 hover:ring-[var(--tier)]"
            : "hover:-translate-y-1 hover:border-line-strong hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 pr-12">
          <p className="truncate text-[14.5px] font-bold leading-tight text-ink">{lead.name}</p>
          {(lead.title || lead.company) && (
            <p className="mt-1 truncate text-[12.5px] font-medium text-muted">{[lead.title, lead.company].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        {lead.ownerName && (
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-sm ring-2 ring-paper"
            style={{ background: tint.bg, color: tint.fg }}
            title={lead.ownerName}
          >
            {initials(lead.ownerName)}
          </span>
        )}
      </div>

      {(hasTags || hasValue) && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {(lead.tags || []).map((t) => {
            const tagStr = t || "";
            const tLower = tagStr.toLowerCase();
            return (
            <span key={tagStr} className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase", TAG_TINT[tLower] ?? "bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300")}>
              {tLower === "called" ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3" /> called
                </span>
              ) : (
                tagStr
              )}
            </span>
          )})}
          {hasValue && (
            <span
              className="ml-auto rounded-full px-2.5 py-0.5 font-mono text-[12.5px] font-bold tnum shadow-sm"
              style={{ background: "var(--tier-bg)", color: "var(--tier)" }}
            >
              {formatINRCompact(lead.estValue)}
            </span>
          )}
        </div>
      )}

      {showFooter && (
        <div className="mt-3 flex items-center gap-3 border-t border-dashed border-line pt-2.5 text-[11px] text-faint">
          {lead.commentCount > 0 && (
            <span
              className="inline-flex items-center gap-1 font-semibold text-muted"
              title={`${lead.commentCount} ${lead.commentCount === 1 ? "comment" : "comments"}`}
            >
              <MessageSquare className="size-3.5" />
              <span className="tnum">{lead.commentCount}</span>
            </span>
          )}
          {lead.convertedAccountId && (
            <span className="inline-flex items-center gap-1 font-semibold text-success">
              <CornerDownRight className="size-3.5" /> account
            </span>
          )}
          {lead.lastActivityAt && (
            <time
              dateTime={lead.lastActivityAt}
              title={absoluteTime(lead.lastActivityAt)}
              className="ml-auto tnum"
            >
              {relativeTime(lead.lastActivityAt)}
            </time>
          )}
        </div>
      )}

      {/* Quick Actions (Hover) */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <button onClick={(e) => { e.stopPropagation(); if (lead.email) window.location.href = `mailto:${lead.email}` }} className="rounded-full bg-paper/90 p-1.5 text-muted shadow-sm ring-1 ring-line hover:text-violet-600 backdrop-blur-sm" title="Email">
          <Mail className="size-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); if (lead.phone) window.location.href = `tel:${lead.phone}` }} className="rounded-full bg-paper/90 p-1.5 text-muted shadow-sm ring-1 ring-line hover:text-violet-600 backdrop-blur-sm" title="Call">
          <Phone className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
