"use client";
import { Page, PageSplit } from "@/components/layout/Page";
import { PageHeader } from "@/components/layout/PageHeader";
import { useLeadsChanged } from "@/components/layout/ShellContext";
import { Panel } from "@/components/ui/Panel";
import { ErrorState, Skeleton } from "@/components/ui/Misc";
import { TodayHeader } from "@/components/dashboard/TodayHeader";
import { PipelineRibbon } from "@/components/dashboard/PipelineRibbon";
import { WorkQueue } from "@/components/dashboard/WorkQueue";
import { StageTable } from "@/components/dashboard/StageTable";
import { ReceivablesRail } from "@/components/dashboard/ReceivablesRail";
import { useApi } from "@/lib/client";
import type { DashboardData } from "@/lib/types";

export default function DashboardPage() {
  const { data, loading, error, refresh } = useApi<DashboardData>("/api/dashboard");
  useLeadsChanged(refresh);

  return (
    <Page>
      <PageHeader title="Today" />
      {error ? (
        <Panel>
          <ErrorState message={error} onRetry={refresh} />
        </Panel>
      ) : loading || !data ? (
        <TodaySkeleton />
      ) : (
        <Today data={data} refresh={refresh} />
      )}
    </Page>
  );
}

function Today({ data, refresh }: { data: DashboardData; refresh: () => void }) {
  const now = new Date(data.asOf);
  return (
    <>
      <TodayHeader data={data} />
      <PipelineRibbon data={data} />
      <PageSplit railLabel="Receivables" rail={<ReceivablesRail receivables={data.receivables} upcoming={data.upcoming} now={now} />}>
        <WorkQueue items={data.queue} now={now} onChanged={refresh} />
        <StageTable pipeline={data.pipeline} now={now} />
      </PageSplit>
    </>
  );
}

function TodaySkeleton() {
  return (
    <div aria-busy="true" className="contents">
      <span className="sr-only" role="status">
        Loading today
      </span>
      <Panel>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-3 h-8 w-full max-w-2xl" />
        <Skeleton className="mt-2 h-8 w-2/3 max-w-xl" />
      </Panel>
      <Panel>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-7 w-full" />
        <Skeleton className="mt-2 h-6 w-full" />
      </Panel>
      <PageSplit
        rail={[0, 1].map((i) => (
          <Panel key={i}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-10 w-36" />
            <Skeleton className="mt-3 h-3 w-full" />
          </Panel>
        ))}
      >
        <Panel>
          <Skeleton className="h-4 w-28" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="mt-4 h-10 w-full" />
          ))}
        </Panel>
      </PageSplit>
    </div>
  );
}
