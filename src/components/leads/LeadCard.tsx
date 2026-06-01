"use client";
import type { CSSProperties } from "react";
import { Phone } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { formatINRCompact, initials, avatarTint, valueTier, cn } from "@/lib/utils";
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
          borderLeftColor: "var(--tier)",
          borderLeftWidth: "3px",
        } as CSSProperties)
      : undefined;
  return (
    <div
      style={tierStyle}
      className={cn(
        "rounded-[var(--radius-md)] border border-line bg-paper p-3.5 shadow-[var(--shadow-card)] transition-all duration-150",
        dragging
          ? "rotate-[1.5deg] scale-[1.02] shadow-[var(--shadow-pop)] ring-2 ring-violet-300"
          : tier >= 0
            ? "hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] hover:ring-2 hover:ring-[var(--tier)]"
            : "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-pop)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold leading-tight text-ink">{lead.name}</p>
          {lead.company && <p className="mt-0.5 truncate text-[12px] text-muted">{lead.company}</p>}
        </div>
        {lead.ownerName && (
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: tint.bg, color: tint.fg }}
            title={lead.ownerName}
          >
            {initials(lead.ownerName)}
          </span>
        )}
      </div>

      {(lead.estValue > 0 || lead.tags.length > 0 || lead.convertedAccountId) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {lead.tags.map((t) => (
            <span key={t} className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", TAG_TINT[t.toLowerCase()] ?? "bg-violet-50 text-violet-700")}>
              {t === "called" ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3" /> called
                </span>
              ) : (
                t
              )}
            </span>
          ))}
          {lead.estValue > 0 && (
            <span
              className="ml-auto rounded-full px-2 py-0.5 font-mono text-[12px] font-bold tnum"
              style={{ background: "var(--tier-bg)", color: "var(--tier)" }}
            >
              {formatINRCompact(lead.estValue)}
            </span>
          )}
          {lead.convertedAccountId && <span className="text-[11px] font-medium text-success">→ became an account</span>}
        </div>
      )}
    </div>
  );
}
