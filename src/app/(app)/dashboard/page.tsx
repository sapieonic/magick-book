"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Search, Plus, TrendingUp, TrendingDown, ArrowRight, Phone, BellRing, CheckCircle } from "lucide-react";
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
      <PageHeader className="pb-6">
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight text-ink">
            {greeting()}, {user.name.split(" ")[0]} <span className="inline-block origin-bottom-right hover:animate-pulse">👋</span>
          </h1>
          <p className="mt-1 text-[13.5px] text-muted font-medium">Here's what's happening with your business today.</p>
        </div>
        <div className="relative ml-auto hidden max-w-sm flex-1 md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).value && router.push(`/leads?q=${encodeURIComponent((e.target as HTMLInputElement).value)}`)}
            placeholder="Search leads, accounts…"
            className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-paper pl-9 pr-3 text-[13.5px] text-ink placeholder:text-faint transition-all focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-500/10 hover:border-line-strong shadow-sm"
          />
        </div>
        <Button variant="primary" onClick={() => setAdding(true)} className="ml-auto md:ml-0 shadow-violet rounded-full px-5 transition-transform hover:scale-105">
          <Plus className="size-4 mr-1" /> New lead
        </Button>
      </PageHeader>

      <div className="px-6 pb-12 lg:px-8">
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <div className="mx-auto max-w-[1280px]">
            {/* Bento Grid */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
              
              {/* KPIs (Top row of the grid) */}
              <Kpi label="Open leads" value={data?.openLeads} loading={loading} accent="ink" delay="0ms" />
              <Kpi label="Qualified" value={data?.qualified} loading={loading} accent="violet" delay="50ms" />
              <Kpi label="Won this month" value={data?.wonThisMonth} loading={loading} accent="success" delay="100ms" />
              <Kpi label="Active accounts" value={data?.activeAccounts} loading={loading} accent="ink" delay="150ms" />

              {/* Main Bento Blocks */}
              <div className="md:col-span-2 lg:col-span-2">
                <PipelineCard data={data} loading={loading} />
              </div>
              <div className="md:col-span-1 lg:col-span-1">
                <RevenueCard data={data} loading={loading} />
              </div>
              <div className="md:col-span-1 lg:col-span-1">
                <AttentionCard data={data} loading={loading} />
              </div>

            </div>
          </div>
        )}
      </div>

      <AddLeadDrawer open={adding} onClose={() => setAdding(false)} onCreated={() => refresh()} />
    </>
  );
}

function Kpi({ label, value, loading, accent, delay }: { label: string; value?: number; loading: boolean; accent: "ink" | "violet" | "success", delay: string }) {
  const colors = { ink: "text-ink", violet: "text-violet-600", success: "text-success" };
  const bgColors = { ink: "bg-slate-200", violet: "bg-violet-200", success: "bg-success" };
  
  // Random heights for decorative sparkline
  const bars = [40, 70, 45, 90, 60, 30, 80];
  
  return (
    <Card premium className="relative overflow-hidden p-6 group animate-fade-up" style={{ animationDelay: delay }}>
      {/* Subtle background glow */}
      <div className={cn("absolute -right-6 -top-6 size-28 rounded-full opacity-10 blur-[30px] transition-all duration-700 group-hover:scale-150", bgColors[accent])} />
      
      <div className="relative z-10">
        <p className="text-[13.5px] font-semibold text-muted mb-3">{label}</p>
        {loading ? (
          <Skeleton className="h-10 w-24 mt-1" />
        ) : (
          <div className="flex items-end justify-between gap-3">
            <p className={cn("font-display text-[40px] font-extrabold leading-none tracking-tight tnum", colors[accent])}>
              {value ?? 0}
            </p>
            {/* Decorative mini sparkline */}
            <div className="flex h-7 w-16 items-end gap-[2px] opacity-30 mix-blend-multiply group-hover:opacity-50 transition-opacity">
              {bars.map((h, i) => (
                <div key={i} className={cn("w-full rounded-t-sm", bgColors[accent])} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function PipelineCard({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const max = Math.max(1, ...(data?.pipeline.map((p) => p.count) ?? [1]));
  return (
    <Card premium className="flex h-full min-h-[320px] flex-col p-6 animate-fade-up" style={{ animationDelay: '200ms' }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-display text-[18px] font-bold text-ink">Pipeline Flow</h2>
          <p className="text-[13px] text-muted font-medium mt-1">Value and volume by stage</p>
        </div>
        <Link href="/leads" className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3.5 py-1.5 text-[12.5px] font-bold text-violet-600 transition-colors hover:bg-violet-100 hover:text-violet-700">
          Open board <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {loading ? (
        <div className="mt-auto flex h-48 items-end gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="flex-1 rounded-t-[var(--radius-sm)]" style={{ height: `${40 + i * 14}%` }} />
          ))}
        </div>
      ) : (
        <div className="group/board mt-auto flex h-48 items-stretch gap-3">
          {data?.pipeline.map((p) => {
            const meta = STAGE_META[p.stage];
            const h = Math.max(12, (p.count / max) * 100);
            return (
              <Link key={p.stage} href="/leads" className="group flex flex-1 flex-col items-center gap-2 relative transition-all duration-300 hover:!opacity-100 group-hover/board:opacity-40">
                <div className="flex w-full flex-1 items-end relative">
                  <div
                    className="w-full rounded-t-[var(--radius-sm)] transition-all duration-500 group-hover:scale-y-[1.03] origin-bottom shadow-sm"
                    style={{ 
                      height: `${h}%`, 
                      background: `linear-gradient(to top, ${meta.dot}20, ${meta.dot}D0)`,
                      borderTop: `3px solid ${meta.dot}`
                    }}
                  />
                  {/* Tooltip on hover */}
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 transform translate-y-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 pointer-events-none z-10 flex flex-col items-center">
                    <span className="rounded-md bg-ink px-2.5 py-1.5 text-[11px] font-bold text-paper shadow-pop tnum whitespace-nowrap">{p.count} deals</span>
                    <div className="w-2 h-2 bg-ink transform rotate-45 -mt-1"></div>
                  </div>
                </div>
                <div className="text-center mt-3">
                  <p className="text-[12.5px] font-bold text-ink-soft">{meta.label}</p>
                  <p className="text-[11px] font-semibold text-faint tnum mt-0.5">{formatINRCompact(p.value)}</p>
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
    <Card premium className="relative flex h-full min-h-[320px] flex-col overflow-hidden p-6 animate-fade-up" style={{ animationDelay: '250ms' }}>
      {/* Decorative Mesh background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.15] mix-blend-multiply">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-brand-to blur-[40px]"></div>
        <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-brand-from blur-[40px]"></div>
      </div>
      
      <div className="relative z-10 flex flex-col h-full">
        <h2 className="font-display text-[18px] font-bold text-ink">This month</h2>
        {loading ? (
          <Skeleton className="mt-4 h-14 w-32" />
        ) : (
          <div className="mt-4">
            <p className="font-display text-[48px] font-extrabold leading-none tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-ink to-ink-soft tnum drop-shadow-sm">
              {formatINRCompact(data?.revenueThisMonth ?? 0)}
            </p>
          </div>
        )}
        <div className="mt-5 inline-flex items-center gap-1.5 self-start rounded-full bg-paper/80 px-3 py-1.5 text-[12.5px] border border-line-strong backdrop-blur-sm shadow-sm">
          <span className={cn("inline-flex items-center gap-1 font-extrabold", up ? "text-success" : "text-danger")}>
            {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {Math.abs(data?.revenueDeltaPct ?? 0)}%
          </span>
          <span className="text-muted font-semibold">vs last month</span>
        </div>
        <div className="mt-auto pt-8">
          <div className="h-[1px] w-full bg-gradient-to-r from-line-strong via-line to-transparent mb-5" />
          <p className="text-[13px] leading-relaxed text-muted font-medium pr-4">
            Won deals become active accounts. Keep the pipeline moving and revenue follows.
          </p>
        </div>
      </div>
    </Card>
  );
}

function AttentionCard({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const items = data?.attention ?? [];
  return (
    <Card premium className="flex h-full min-h-[320px] flex-col p-6 animate-fade-up" style={{ animationDelay: '300ms' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display text-[18px] font-bold text-ink">Needs attention</h2>
        </div>
        {items.length > 0 && (
          <span className="flex items-center justify-center rounded-full bg-danger-bg px-2.5 py-0.5 text-[12px] font-bold text-danger animate-pulse-soft">
            {items.length} items
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto pr-2 -mr-2">
        {loading ? (
          <div className="space-y-3 mt-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-[var(--radius-md)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center opacity-80 pt-4">
            <div className="mb-4 rounded-full bg-success-bg p-4 text-success shadow-sm">
              <CheckCircle className="size-6" />
            </div>
            <p className="text-[14px] font-bold text-ink">All caught up!</p>
            <p className="text-[13px] font-medium text-muted mt-1">Nothing needs attention right now ✨</p>
          </div>
        ) : (
          <ul className="space-y-2 mt-1">
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
      <Link href={item.href} className="group flex items-center gap-3 rounded-[var(--radius-md)] border border-transparent p-2.5 transition-all duration-300 hover:border-line hover:bg-paper/60 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <span className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[10px] transition-all duration-300",
          item.kind === "invoice_overdue" 
            ? "bg-danger-bg text-danger group-hover:bg-danger group-hover:text-white group-hover:shadow-sm" 
            : "bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white group-hover:shadow-sm"
        )}>
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-bold text-ink transition-colors group-hover:text-violet-700">
            {item.title}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone={item.tagTone === "danger" ? "danger" : item.tagTone === "warn" ? "warn" : "neutral"} className="px-1.5 py-0 text-[10.5px]">
              {item.tag}
            </Badge>
            <span className="truncate text-[11.5px] font-medium text-muted">{item.action}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
