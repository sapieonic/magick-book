"use client";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { STAGE_META } from "@/lib/constants";
import { formatINRCompact, relativeTime } from "@/lib/utils";
import type { LeadDTO } from "@/lib/types";

export function LeadTable({ leads }: { leads: LeadDTO[] }) {
  const router = useRouter();
  return (
    <div className="px-4 pb-6 sm:px-6 lg:px-8">
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-paper shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-line bg-canvas/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-5 py-3">Lead</th>
              <th className="px-5 py-3">Company</th>
              <th className="px-5 py-3">Stage</th>
              <th className="px-5 py-3">Owner</th>
              <th className="px-5 py-3 text-right">Est. value</th>
              <th className="px-5 py-3">Source</th>
              <th className="px-5 py-3 text-right">Activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {leads.map((l) => {
              const meta = STAGE_META[l.stage];
              return (
                <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)} className="cursor-pointer transition-colors hover:bg-violet-50/40">
                  <td className="px-5 py-3.5 text-[13.5px] font-semibold text-ink">{l.name}</td>
                  <td className="px-5 py-3.5 text-[13px] text-muted">{l.company || "—"}</td>
                  <td className="px-5 py-3.5">
                    <Badge tint={meta.tint} dot={meta.dot}>{meta.label}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    {l.ownerName ? (
                      <span className="inline-flex items-center gap-2 text-[13px] text-ink-soft">
                        <Avatar name={l.ownerName} size={22} /> {l.ownerName}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-[13px] text-ink-soft tnum">{l.estValue > 0 ? formatINRCompact(l.estValue) : "—"}</td>
                  <td className="px-5 py-3.5 text-[13px] text-muted">{l.source}</td>
                  <td className="px-5 py-3.5 text-right text-[12.5px] text-faint">{relativeTime(l.lastActivityAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
