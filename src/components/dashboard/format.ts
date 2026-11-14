import { formatMoney } from "@/components/ui/Money";
import { plural } from "@/lib/utils";
import type { DashboardData } from "@/lib/types";

/** A sentence fragment; `strong` parts carry the figures. */
interface Phrase {
  text: string;
  strong?: boolean;
}

/** The Today header's one-sentence brief, built from live data. */
export function summaryPhrases(d: DashboardData): Phrase[] {
  const out: Phrase[] = [];
  if (d.openLeads > 0) {
    out.push({ text: plural(d.openLeads, "open lead"), strong: true }, { text: " worth " });
    out.push({ text: formatMoney(d.openValue, true), strong: true }, { text: ". " });
  } else {
    out.push({ text: "No open leads", strong: true }, { text: ". " });
  }

  const { outstanding, owingAccounts } = d.receivables;
  if (outstanding > 0) {
    out.push({ text: `${formatMoney(outstanding, true)} is outstanding`, strong: true });
    out.push({ text: ` across ${plural(owingAccounts, "account")}. ` });
  } else {
    out.push({ text: "Nothing is outstanding. " });
  }

  const followUps = d.queue.filter((q) => q.kind !== "invoice").length;
  if (followUps > 0) {
    out.push({ text: plural(followUps, "follow-up"), strong: true }, { text: followUps === 1 ? " is waiting" : " are waiting" });
  } else {
    out.push({ text: "No follow-ups are waiting" });
  }

  if (d.wonThisMonth > 0) {
    out.push({ text: ", and " }, { text: plural(d.wonThisMonth, "lead"), strong: true }, { text: " won this month." });
  } else {
    out.push({ text: ", and nothing has been won yet this month." });
  }
  return out;
}

/** "down from ₹5.9L in October", "up from…", "same as…", "nothing in October". */
export function collectedComparison(thisMonth: number, lastMonth: number, lastMonthName: string): string {
  if (lastMonth === 0) return `nothing collected in ${lastMonthName}`;
  const prev = `${formatMoney(lastMonth, true)} in ${lastMonthName}`;
  if (thisMonth === lastMonth) return `the same as ${lastMonthName}`;
  return thisMonth > lastMonth ? `up from ${prev}` : `down from ${prev}`;
}
