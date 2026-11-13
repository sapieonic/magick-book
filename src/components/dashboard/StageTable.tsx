import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Money, formatMoney } from "@/components/ui/Money";
import { Table, Th, Td } from "@/components/ui/Table";
import { segmentShares } from "@/components/ui/ProportionBar";
import { stageColor } from "@/components/ui/stage";
import { STAGE_META } from "@/lib/constants";
import { stageHref } from "./PipelineRibbon";
import { Staleness } from "@/components/ui/Staleness";
import { agoInWords, daysSince, plural } from "@/lib/utils";
import type { PipelineStageSummary } from "@/lib/types";

/** Count, value, share and the longest-waiting lead for each pipeline stage. */
export function StageTable({ pipeline, now }: { pipeline: PipelineStageSummary[]; now: Date }) {
  const total = pipeline.reduce((s, p) => s + p.value, 0);
  const rows = segmentShares(pipeline.map((p) => ({ ...p, key: p.stage, label: STAGE_META[p.stage].label, color: stageColor(p.stage) })));

  return (
    <Panel title="Pipeline by stage" className="max-md:hidden">
      <Table>
        <thead>
          <tr>
            <Th>Stage</Th>
            <Th numeric>Leads</Th>
            <Th numeric>Value</Th>
            <Th>Share of {formatMoney(total, true)}</Th>
            <Th>Oldest untouched</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <Td>
                <Link href={stageHref(r.stage)} className="link">
                  {r.label}
                </Link>
              </Td>
              <Td numeric>{r.count || "–"}</Td>
              <Td numeric>
                <Money value={r.value} />
              </Td>
              <Td className="w-[28%]">
                <div className="h-2 min-w-24 rounded-full bg-hover" role="img" aria-label={`${r.pct}% of pipeline value`}>
                  {r.value > 0 && <div className="h-2 rounded-full" style={{ width: `${Math.max(1, r.share * 100)}%`, background: r.color }} />}
                </div>
              </Td>
              <Td className="text-ink-2">
                <StageNote row={r} previous={rows[i - 1]} now={now} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

function StageNote({ row, previous, now }: { row: PipelineStageSummary; previous?: PipelineStageSummary; now: Date }) {
  if (row.stage === "won") {
    return row.latest ? (
      <>
        Last win {agoInWords(daysSince(row.latest.lastActivityAt, now))} ·{" "}
        <Link href={`/leads/${row.latest.id}`} className="link">
          {row.latest.company || row.latest.name}
        </Link>
      </>
    ) : (
      "No wins yet"
    );
  }
  if (!row.oldest) {
    return previous?.count
      ? `${plural(previous.count, `${STAGE_META[previous.stage].label.toLowerCase()} lead`)} could move here`
      : "No leads";
  }
  return (
    <>
      <Link href={`/leads/${row.oldest.id}`} className="link">
        {row.oldest.name}
      </Link>{" "}
      · <Staleness since={row.oldest.lastActivityAt} now={now} />
    </>
  );
}
