import { StatusPill, type DomainStatus } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Panel } from "@/components/ui/Panel";
import { ProportionBar } from "@/components/ui/ProportionBar";
import { Table, Td, Th } from "@/components/ui/Table";
import { stageColor } from "@/components/ui/stage";
import { PIPELINE_STAGES, STAGE_META, type PipelineStage } from "@/lib/constants";

// Illustrative figures for the sign-in screen. Not read from any workspace.
const PIPELINE: Record<PipelineStage, number> = { new: 110000, contacted: 220000, qualified: 140000, proposal: 0, won: 810000 };
const INVOICES: { no: number; account: string; amount: number; status: DomainStatus }[] = [
  { no: 1023, account: "Samarthya Enterprise", amount: 437096, status: "overdue" },
  { no: 1024, account: "Brewtiful Coffee", amount: 1020, status: "sent" },
  { no: 1018, account: "Lumen Studio", amount: 18400, status: "paid" },
];

/** A small, static look at the product: the pipeline ribbon over a few ledger rows. */
export function ProductGlimpse({ className }: { className?: string }) {
  return (
    <Panel as="figure" title="A day in the book" meta="sample workspace" className={className}>
      <ProportionBar
        size="sm"
        aria-label="Sample pipeline by value"
        emptyLabel="Empty stage"
        segments={PIPELINE_STAGES.map((s) => ({
          key: s,
          label: STAGE_META[s].label,
          value: PIPELINE[s],
          color: stageColor(s),
          valueClassName: s === "won" ? "text-paid" : undefined,
        }))}
      />
      <Table className="mt-5">
        <thead>
          <tr>
            <Th>Invoice</Th>
            <Th>Account</Th>
            <Th numeric>Amount</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {INVOICES.map((inv) => (
            <tr key={inv.no}>
              <Td className="font-mono text-[13px]">#{inv.no}</Td>
              <Td>{inv.account}</Td>
              <Td numeric>
                <Money value={inv.amount} />
              </Td>
              <Td>
                <StatusPill status={inv.status} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}
