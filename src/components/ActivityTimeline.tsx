"use client";
import {
  Phone,
  MessageCircle,
  Mail,
  MessageSquare,
  StickyNote,
  Flag,
  Sparkles,
  Trophy,
  Receipt,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Time } from "@/components/ui/Time";
import type { ActivityDTO } from "@/lib/types";
import type { ActivityKind } from "@/lib/constants";

const ICONS: Record<ActivityKind, LucideIcon> = {
  lead_created: Sparkles,
  stage_change: Flag,
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  sms: MessageSquare,
  note: StickyNote,
  converted: Trophy,
  invoice: Receipt,
  expense: Wallet,
};

const TINT: Partial<Record<ActivityKind, string>> = {
  converted: "bg-success-bg text-success",
  stage_change: "bg-violet-50 text-violet-600",
  call: "bg-info-bg text-info",
  whatsapp: "bg-success-bg text-success",
  invoice: "bg-warn-bg text-warn",
  expense: "bg-warn-bg text-warn",
};

export function ActivityTimeline({ activities }: { activities: ActivityDTO[] }) {
  if (!activities.length) {
    return <p className="py-6 text-[13px] text-muted">No activity yet. Reach out and it&apos;ll show up here.</p>;
  }
  return (
    <ol className="relative">
      {activities.map((a, i) => {
        const Icon = ICONS[a.kind] ?? StickyNote;
        const last = i === activities.length - 1;
        const isNote = a.kind === "note";
        return (
          <li key={a.id} className="relative flex gap-3.5 pb-5">
            {!last && <span className="absolute left-[15px] top-9 h-[calc(100%-1rem)] w-px bg-line" />}
            <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ${TINT[a.kind] ?? "bg-canvas text-ink-soft"}`}>
              <Icon className="size-[15px]" strokeWidth={2.1} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13.5px] font-semibold text-ink">
                  {isNote ? "Note" : a.title}
                  {isNote && a.actorName && <span className="font-normal text-muted"> · {a.actorName}</span>}
                </p>
                <Time value={a.createdAt} className="shrink-0 text-[11.5px] text-faint" />
              </div>
              {isNote ? (
                a.detail && (
                  <p className="mt-1.5 whitespace-pre-wrap rounded-[var(--radius-sm)] border border-line bg-canvas/60 px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
                    {a.detail}
                  </p>
                )
              ) : (
                <>
                  {a.detail && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{a.detail}</p>}
                  {a.actorName && <p className="mt-0.5 text-[11px] text-faint">by {a.actorName}</p>}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
