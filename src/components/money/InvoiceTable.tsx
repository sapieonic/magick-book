"use client";
import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Table, Th, Td, TwoLine } from "@/components/ui/Table";
import { Button, LinkButton } from "@/components/ui/Button";
import { StatusPill, STATUS_META } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { useInvoiceActions } from "@/components/invoices/useInvoiceActions";
import { isoDay, shortDate } from "@/lib/dates";
import { groupLedger, invoiceAge } from "@/lib/money-charts";
import { displayStatus, isOutstanding, paymentDate } from "@/lib/receivables";
import { cn, plural } from "@/lib/utils";
import type { InvoiceDTO } from "@/lib/types";
import type { CsvCell } from "./csv";

/** Paid invoices shown before "Show earlier paid invoices". */
const PAID_PREVIEW = 8;

/**
 * Issued, Status and File have their own columns only from xl (1280). Below
 * that the age says the status, and the download sits with the row actions,
 * so Mark paid and Remind always fit without scrolling sideways.
 */
const WIDE_COL = "max-xl:hidden";

const sum = (rows: InvoiceDTO[]) => rows.reduce((s, i) => s + i.amount, 0);

/** The ledger rows as CSV, in ledger order: dates as IST days, amounts as plain numbers. */
export function ledgerCsvRows(invoices: InvoiceDTO[], now: Date): CsvCell[][] {
  const { outstanding, paid, draft } = groupLedger(invoices, now);
  const day = (d: string | Date | null) => (d ? isoDay(d) : null);
  return [
    ["Invoice", "Account", "Issued", "Due", "Paid on", "Status", "Age", "Amount"],
    ...[...outstanding, ...paid, ...draft].map((inv) => [
      inv.number,
      inv.accountName ?? "",
      day(inv.issuedAt),
      day(inv.dueAt),
      day(paymentDate(inv)),
      STATUS_META[displayStatus(inv, now)].label,
      invoiceAge(inv, now).text,
      inv.amount,
    ]),
  ];
}

/**
 * The invoice ledger: Outstanding, then Paid (then any drafts), each with a
 * subtotal row, and a total footer. Outstanding rows can be marked paid or
 * reminded inline; stored files download through the invoice document route.
 */
export function InvoiceTable({
  invoices,
  now,
  filtered,
  onChanged,
}: {
  invoices: InvoiceDTO[];
  now: Date;
  /** The rows are narrowed by a filter or search, so the footer is not "total billed". */
  filtered: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const actions = useInvoiceActions(onChanged);
  const [showAllPaid, setShowAllPaid] = useState(false);
  const groups = groupLedger(invoices, now);
  const paidRows = showAllPaid ? groups.paid : groups.paid.slice(0, PAID_PREVIEW);
  const hiddenPaid = groups.paid.length - paidRows.length;
  const issued = [...groups.outstanding, ...groups.paid];

  const row = (inv: InvoiceDTO) => (
    <InvoiceRow key={inv.id} inv={inv} now={now} busy={actions.busyId === inv.id} onAct={(a) => (a === "paid" ? actions.markPaid(inv) : actions.remind(inv))} />
  );

  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Invoice</Th>
            <Th hideOnPhone>Account</Th>
            <Th className={WIDE_COL}>Issued</Th>
            <Th hideOnPhone>Due</Th>
            <Th hideOnPhone>Age</Th>
            <Th numeric>Amount</Th>
            <Th className={WIDE_COL}>Status</Th>
            <Th className={WIDE_COL}>File</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {groups.outstanding.length > 0 && (
            <SpanRow kind="group" label={`Outstanding · ${plural(groups.outstanding.length, "invoice")}`} amount={sum(groups.outstanding)} />
          )}
          {groups.outstanding.map(row)}
          {groups.paid.length > 0 && <SpanRow kind="group" label={`Paid · ${plural(groups.paid.length, "invoice")}`} amount={sum(groups.paid)} />}
          {paidRows.map(row)}
          {groups.draft.length > 0 && (
            <SpanRow kind="group" label={`Draft · ${plural(groups.draft.length, "invoice")} not yet issued`} amount={sum(groups.draft)} />
          )}
          {groups.draft.map(row)}
        </tbody>
        {issued.length > 0 && (
          <tfoot>
            <SpanRow kind="total" label={`${filtered ? "Total shown" : "Total billed"} · ${plural(issued.length, "invoice")}`} amount={sum(issued)} />
          </tfoot>
        )}
      </Table>
      {hiddenPaid > 0 && (
        <LinkButton className="mt-3 text-[13px]" onClick={() => setShowAllPaid(true)}>
          Show {plural(hiddenPaid, "earlier paid invoice")}
        </LinkButton>
      )}
    </>
  );
}

function InvoiceRow({
  inv,
  now,
  busy,
  onAct,
}: {
  inv: InvoiceDTO;
  now: Date;
  busy: boolean;
  onAct: (action: "paid" | "remind") => void;
}) {
  const age = invoiceAge(inv, now);
  const paidOn = paymentDate(inv);
  const open = isOutstanding(inv);
  const ageText = <span className={age.late ? "text-overdue" : undefined}>{age.text}</span>;
  const account = (
    <Link href={`/accounts/${inv.accountId}`} className="link">
      {inv.accountName ?? "Account"}
    </Link>
  );
  const download = inv.hasFile && (
    <a
      href={`/api/invoices/${inv.id}/document`}
      target="_blank"
      rel="noopener"
      className="link inline-flex items-center gap-1 text-[13px]"
      aria-label={`Download, invoice #${inv.number} file`}
    >
      <Download className="size-4" strokeWidth={1.5} aria-hidden />
      <span className="max-xl:hidden">Download</span>
    </a>
  );

  return (
    <tr>
      <Td>
        <TwoLine
          className="py-0 max-md:py-2"
          primary={<span className="font-mono text-[13px] font-normal">#{inv.number}</span>}
          secondary={
            <>
              {account} · {ageText}
            </>
          }
          phoneOnly
        />
      </Td>
      <Td hideOnPhone>{account}</Td>
      <Td className={cn(WIDE_COL, "tnum whitespace-nowrap text-ink-2")}>{shortDate(inv.issuedAt)}</Td>
      <Td hideOnPhone className="tnum whitespace-nowrap text-ink-2">
        {paidOn ? `Paid ${shortDate(paidOn, "auto", now)}` : inv.dueAt ? shortDate(inv.dueAt, "auto", now) : "–"}
      </Td>
      <Td hideOnPhone className={cn("whitespace-nowrap", age.late ? "font-medium text-overdue" : "text-ink-3")}>
        {age.text}
      </Td>
      <Td numeric>
        <Money value={inv.amount} />
      </Td>
      <Td className={cn(WIDE_COL, "whitespace-nowrap")}>
        <StatusPill status={displayStatus(inv, now)} />
      </Td>
      <Td className={WIDE_COL}>{download || <span className="text-ink-3">–</span>}</Td>
      <Td className="whitespace-nowrap text-right">
        {/* Phones stack the actions so Remind stays beside every outstanding invoice. */}
        <span className="inline-flex items-center justify-end gap-1 max-md:flex-col max-md:items-end max-md:py-1.5">
          {open && (
            <>
              <Button size="sm" onClick={() => onAct("paid")} loading={busy} aria-label={`Mark paid, invoice #${inv.number}`}>
                Mark paid
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onAct("remind")} disabled={busy} aria-label={`Remind, invoice #${inv.number}`}>
                Remind
              </Button>
            </>
          )}
          {download && <span className="xl:hidden">{download}</span>}
        </span>
      </Td>
    </tr>
  );
}

/**
 * Subtotal or total row. The label spans the columns before Amount, and how
 * many of those show depends on the width, so there is one label cell per
 * layout: Invoice to Age from xl, without Issued below xl, Invoice alone on phones.
 */
function SpanRow({ kind, label, amount }: { kind: "group" | "total"; label: string; amount: number }) {
  return (
    <tr className={kind}>
      <td colSpan={5} className="max-xl:hidden">
        {label}
      </td>
      <td colSpan={4} className="max-md:hidden xl:hidden">
        {label}
      </td>
      <td className={cn("md:hidden", kind === "group" ? "pl-[10px]" : "pl-0")}>{label}</td>
      <Td numeric>
        <Money value={amount} />
      </Td>
      <Td className={WIDE_COL} />
      <Td className={WIDE_COL} />
      <Td />
    </tr>
  );
}
