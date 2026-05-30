"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Search, Plus, TrendingUp, TrendingDown, ArrowRight, Phone, BellRing } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { useSession } from "@/components/layout/SessionContext";
import { AddLeadDrawer } from "@/components/leads/AddLeadDrawer";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, Skeleton, ErrorState } from "@/components/ui/Misc";
import { useApi } from "@/lib/client";
import { formatINRCompact, cn } from "@/lib/utils";
import { STAGE_META } from "@/lib/constants";
import type { DashboardData, AttentionItem } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const user = useSession();
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<DashboardData>("/api/dashboard");
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader>
        <h1 className="font-display text-[22px] font-bold tracking-tight text-ink">
          {greeting()}, {user.name.split(" ")[0]} <span className="inline-block">👋</span>
        </h1>
        <div className="relative ml-auto hidden max-w-sm flex-1 md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).value && router.push(`/leads?q=${encodeURIComponent((e.target as HTMLInputElement).value)}`)}
            placeholder="Search leads, accounts…"
            className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-paper pl-9 pr-3 text-[13.5px] text-ink placeholder:text-faint focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-100"
          />
        </div>
        <Button variant="primary" onClick={() => setAdding(true)} className="ml-auto md:ml-0">
          <Plus className="size-4" /> New lead
        </Button>
      </PageHeader>

      <div className="px-6 py-6 lg:px-8">
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <div className="mx-auto max-w-[1180px] space-y-5">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label="Open leads" value={data?.openLeads} loading={loading} accent="ink" />
              <Kpi label="Qualified" value={data?.qualified} loading={loading} accent="violet" />
              <Kpi label="Won this month" value={data?.wonThisMonth} loading={loading} accent="success" />
              <Kpi label="Active accounts" value={data?.activeAccounts} loading={loading} accent="ink" />
            </div>

            {/* Pipeline + revenue */}
            <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
              <PipelineCard data={data} loading={loading} />
              <RevenueCard data={data} loading={loading} />
            </div>

            {/* Needs attention */}
            <AttentionCard data={data} loading={loading} />
          </div>
        )}
      </div>

      <AddLeadDrawer open={adding} onClose={() => setAdding(false)} onCreated={() => refresh()} />
    </>
  );
}

function Kpi({ label, value, loading, accent }: { label: string; value?: number; loading: boolean; accent: "ink" | "violet" | "success" }) {
  const colors = { ink: "text-ink", violet: "text-violet-600", success: "text-success" };
  return (
    <Card className="p-5">
      {loading ? (
        <Skeleton className="h-9 w-14" />
      ) : (
        <p className={cn("font-display text-[34px] font-extrabold leading-none tnum", colors[accent])}>{value ?? 0}</p>
      )}
      <p className="mt-2 text-[12.5px] font-medium text-muted">{label}</p>
    </Card>
  );
}

function PipelineCard({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const max = Math.max(1, ...(data?.pipeline.map((p) => p.count) ?? [1]));
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[16px] font-bold text-ink">Your pipeline</h2>
        <Link href="/leads" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-violet-600 hover:underline">
          Open board <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {loading ? (
        <div className="mt-6 flex h-44 items-end gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${40 + i * 14}%` }} />
          ))}
        </div>
      ) : (
        <div className="mt-5 flex h-48 items-end gap-3">
          {data?.pipeline.map((p) => {
            const meta = STAGE_META[p.stage];
            const h = 16 + (p.count / max) * 84;
            return (
              <Link key={p.stage} href="/leads" className="group flex flex-1 flex-col items-center gap-2">
                <span className="text-[12px] font-bold text-ink-soft tnum">{p.count}</span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-[var(--radius-sm)] border border-b-0 transition-all duration-500 group-hover:brightness-95"
                    style={{ height: `${h}%`, background: meta.dot, borderColor: meta.dot, opacity: 0.92 }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-[11.5px] font-semibold text-ink-soft">{meta.label}</p>
                  <p className="text-[10.5px] text-faint tnum">{formatINRCompact(p.value)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function RevenueCard({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const up = (data?.revenueDeltaPct ?? 0) >= 0;
  return (
    <Card className="flex flex-col p-5">
      <h2 className="font-display text-[16px] font-bold text-ink">This month</h2>
      {loading ? (
        <Skeleton className="mt-3 h-12 w-40" />
      ) : (
        <p className="mt-2 font-display text-[42px] font-extrabold leading-none tracking-tight text-ink tnum">
          {formatINRCompact(data?.revenueThisMonth ?? 0)}
        </p>
      )}
      <div className="mt-2 flex items-center gap-1.5 text-[12.5px]">
        <span className="text-muted">new revenue ·</span>
        <span className={cn("inline-flex items-center gap-1 font-semibold", up ? "text-success" : "text-danger")}>
          {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
          {Math.abs(data?.revenueDeltaPct ?? 0)}%
        </span>
        <span className="text-muted">vs last</span>
      </div>
      <div className="my-4 border-t border-dashed border-line" />
      <p className="mt-auto text-[12.5px] leading-relaxed text-muted">
        Won deals → become active accounts. Keep the pipeline moving and revenue follows.
      </p>
    </Card>
  );
}

function AttentionCard({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const items = data?.attention ?? [];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[16px] font-bold text-ink">Needs attention today</h2>
        <span className="text-[12px] text-faint">{items.length} items</span>
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">You&apos;re all caught up. Nothing needs attention right now ✨</p>
        ) : (
          <ul className="divide-y divide-dashed divide-line">
            {items.map((item) => (
              <AttentionRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const Icon = item.kind === "invoice_overdue" ? BellRing : Phone;
  return (
    <li>
      <Link href={item.href} className="group flex items-center gap-3 py-3 transition-colors">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink group-hover:text-violet-700">{item.title}</span>
        <Badge tone={item.tagTone === "danger" ? "danger" : item.tagTone === "warn" ? "warn" : "neutral"}>{item.tag}</Badge>
        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1 text-[12px] font-semibold text-ink-soft transition-colors group-hover:border-violet-400 group-hover:text-violet-700">
          {item.action}
        </span>
      </Link>
    </li>
  );
}
