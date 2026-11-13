import { Fragment, type ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { Money } from "@/components/ui/Money";
import { ageInWords, cn, daysSince } from "@/lib/utils";
import type { LeadDTO } from "@/lib/types";

/** Big name, the one-line story of the lead, and its stage actions. */
export function LeadHero({ lead, open, actions }: { lead: LeadDTO; open: boolean; actions?: ReactNode }) {
  const idle = daysSince(lead.lastActivityAt || lead.createdAt);
  const facts: ReactNode[] = [
    [lead.title, lead.company].filter(Boolean).join(", "),
    lead.estValue > 0 && (
      <>
        <Money value={lead.estValue} className="font-medium text-ink-1" /> estimated
      </>
    ),
    lead.ownerName && `owned by ${lead.ownerName}`,
    <>
      last touched{" "}
      <span className={cn(open && idle > 30 && "font-medium text-overdue")}>{idle < 1 ? "today" : `${ageInWords(idle).toLowerCase()} ago`}</span>
    </>,
  ].filter(Boolean);

  return (
    <Panel aria-label="Lead summary" className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <p className="break-words text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-ink-1">{lead.name}</p>
        <p className="tnum mt-1.5 text-[15px] text-ink-2">
          {facts.map((f, i) => (
            <Fragment key={i}>
              {i > 0 && " · "}
              {f}
            </Fragment>
          ))}
        </p>
      </div>
      {actions && <div className="flex flex-wrap gap-2 max-md:w-full max-md:*:flex-1">{actions}</div>}
    </Panel>
  );
}
