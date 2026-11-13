import Link from "next/link";
import { subMonths } from "date-fns";
import { Panel } from "@/components/ui/Panel";
import { Money, formatMoney } from "@/components/ui/Money";
import { ProportionBar } from "@/components/ui/ProportionBar";
import { collectedComparison, monthName, plural, shortDay } from "./format";
import type { DashboardReceivables, UpcomingReminder } from "@/lib/types";

const ROW = "border-b border-line py-[9px]";

/** Outstanding and its aging, who owes, collections, and the week's reminders. */
export function ReceivablesRail({ receivables, upcoming, now }: { receivables: DashboardReceivables; upcoming: UpcomingReminder[]; now: Date }) {
  return (
    <>
      <Outstanding r={receivables} />
      <WhoOwes r={receivables} />
      <Collected r={receivables} now={now} />
      <Reminders upcoming={upcoming} />
    </>
  );
}

function Outstanding({ r }: { r: DashboardReceivables }) {
  const overdue = (alpha: number) => `color-mix(in srgb, var(--color-overdue-fill) ${alpha}%, transparent)`;
  return (
    <Panel title="Receivables">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <Money value={r.outstanding} compact className="figure text-[40px]" />
        <span className="text-[13px] text-ink-3">
          {r.outstanding > 0 ? `outstanding of ${formatMoney(r.billed, true)} billed` : "Every billed invoice is paid"}
        </span>
      </div>
      {r.outstanding > 0 && (
        <ProportionBar
          variant="bar"
          legend
          aria-label="Aging"
          className="mt-3.5"
          segments={[
            { key: "current", label: "Not yet due", value: r.aging.current, color: "var(--color-due-fill)" },
            { key: "d1_30", label: "1–30 days overdue", value: r.aging.d1_30, color: overdue(55) },
            { key: "d31_60", label: "31–60 days", value: r.aging.d31_60, color: overdue(75) },
            { key: "d60plus", label: "Over 60 days", value: r.aging.d60plus, color: "var(--color-overdue-fill)" },
          ]}
        />
      )}
    </Panel>
  );
}

function WhoOwes({ r }: { r: DashboardReceivables }) {
  const more = r.owingAccounts - r.debtors.length;
  return (
    <Panel
      title="Who owes"
      ruled
      actions={
        <Link href="/money" className="link">
          Open Money
        </Link>
      }
    >
      {r.debtors.length === 0 ? (
        <p className="pt-2.5 text-[13px] text-ink-3">No one owes you money right now.</p>
      ) : (
        <ul>
          {r.debtors.map((d) => (
            <li key={d.accountId} className={`flex items-baseline justify-between gap-3 ${ROW}`}>
              <Link href={`/accounts/${d.accountId}?tab=invoices`} className="min-w-0 text-ink-1 hover:underline">
                {d.name} <span className="text-[13px] text-ink-3">· {plural(d.invoices, "invoice")}</span>
              </Link>
              <Money value={d.amount} />
            </li>
          ))}
          {more > 0 && <li className="pt-2.5 text-[13px] text-ink-3">and {plural(more, "more account")}</li>}
        </ul>
      )}
    </Panel>
  );
}

function Collected({ r, now }: { r: DashboardReceivables; now: Date }) {
  const { thisMonth, lastMonth, payments, latest } = r.collected;
  return (
    <Panel title={`Collected in ${monthName(now)}`}>
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <Money value={thisMonth} compact className="figure text-[28px]" />
        <span className="text-[13px] text-ink-3">{collectedComparison(thisMonth, lastMonth, monthName(subMonths(now, 1)))}</span>
      </div>
      <p className="mt-1.5 text-[13px] text-ink-2">
        {!latest ? (
          "No payments yet this month."
        ) : (
          <>
            {payments === 1 ? "One payment so far: " : `${plural(payments, "payment")} so far, latest from `}
            <Link href={`/accounts/${latest.accountId}?tab=invoices`} className="link">
              {latest.accountName}
            </Link>
            , invoice <span className="font-mono">#{latest.number}</span>.
          </>
        )}
      </p>
    </Panel>
  );
}

function Reminders({ upcoming }: { upcoming: UpcomingReminder[] }) {
  return (
    <Panel title="Reminders this week" meta={upcoming.length || undefined} ruled>
      {upcoming.length === 0 ? (
        <p className="pt-2.5 text-[13px] text-ink-3">Nothing scheduled for the next 7 days.</p>
      ) : (
        <ul>
          {upcoming.map((u) => (
            <li key={u.id} className={`grid grid-cols-[64px_minmax(0,1fr)] gap-x-2 ${ROW}`}>
              <time dateTime={u.dueAt} className="tnum text-[13px] text-ink-3">
                {shortDay(new Date(u.dueAt))}
              </time>
              <span className="min-w-0">
                {u.href ? (
                  <Link href={u.href} className="text-ink-1 hover:underline">
                    {u.title}
                  </Link>
                ) : (
                  u.title
                )}
                {u.entityLabel && <span className="text-[13px] text-ink-3"> · {u.entityLabel}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
