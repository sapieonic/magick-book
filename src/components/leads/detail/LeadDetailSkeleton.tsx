import { Page, PageSplit } from "@/components/layout/Page";
import { PageHeader } from "@/components/layout/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Misc";

/** Loading layout that mirrors the lead page: hero, stage track, main column and rail. */
export function LeadDetailSkeleton() {
  return (
    <Page>
      <PageHeader title="Lead" breadcrumb={[{ label: "Leads", href: "/leads" }]} />
      <p role="status" className="sr-only">
        Loading lead…
      </p>
      <Panel>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      </Panel>
      <Panel>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i}>
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="mt-3 h-4 w-24" />
            </div>
          ))}
        </div>
      </Panel>
      <PageSplit
        rail={
          <>
            <Panel>
              <Skeleton className="h-24 w-full" />
            </Panel>
            <Panel>
              <Skeleton className="h-48 w-full" />
            </Panel>
          </>
        }
      >
        <Panel>
          <Skeleton className="h-28 w-full" />
        </Panel>
        <Panel>
          <Skeleton className="h-64 w-full" />
        </Panel>
      </PageSplit>
    </Page>
  );
}
