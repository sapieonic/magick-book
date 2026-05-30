"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Building2 } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { NewAccountModal } from "@/components/accounts/AccountModals";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PageLoader, ErrorState, EmptyState } from "@/components/ui/Misc";
import { useApi } from "@/lib/client";
import { ACCOUNT_STATUS_META } from "@/lib/constants";
import { formatINRCompact, relativeTime, cn } from "@/lib/utils";
import type { AccountDTO } from "@/lib/types";

interface AccountsResponse {
  accounts: AccountDTO[];
  tabCounts: { all: number; active: number; at_risk: number; churned: number };
}

const TABS = [
  { key: "", label: "All", countKey: "all" },
  { key: "active", label: "Active", countKey: "active" },
  { key: "at_risk", label: "At risk", countKey: "at_risk" },
  { key: "churned", label: "Churned", countKey: "churned" },
] as const;

export default function AccountsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  const url = `/api/accounts${params.toString() ? `?${params}` : ""}`;
  const { data, loading, error, refresh } = useApi<AccountsResponse>(url);
  const accounts = data?.accounts ?? [];

  return (
    <>
      <PageHeader>
        <h1 className="font-display text-[22px] font-bold tracking-tight text-ink">Accounts</h1>

        <div className="ml-2 hidden items-center gap-1 md:flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all",
                status === t.key ? "border-violet-300 bg-violet-50 text-violet-700" : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {t.label}
              <span className="text-faint tnum">{data?.tabCounts[t.countKey] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="relative ml-auto hidden max-w-xs flex-1 sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search accounts"
            className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-paper pl-9 pr-3 text-[13.5px] text-ink placeholder:text-faint focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-100"
          />
        </div>

        <Button variant="primary" onClick={() => setCreating(true)} className="ml-auto sm:ml-0">
          <Plus className="size-4" /> New account
        </Button>
      </PageHeader>

      <div className="px-6 py-6 lg:px-8">
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading ? (
          <PageLoader label="Loading accounts…" />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-6" />}
            title={q || status ? "No matching accounts" : "No accounts yet"}
            description={q || status ? "Try a different filter." : "Convert a won lead, or create an account directly."}
            action={<Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> New account</Button>}
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">Account</th>
                  <th className="px-5 py-3">Primary contact</th>
                  <th className="px-5 py-3 text-center">Contacts</th>
                  <th className="px-5 py-3 text-right">Value / MRR</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {accounts.map((a) => {
                  const meta = ACCOUNT_STATUS_META[a.status];
                  return (
                    <tr key={a.id} onClick={() => router.push(`/accounts/${a.id}`)} className="cursor-pointer transition-colors hover:bg-violet-50/40">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-violet-50 text-violet-600">
                            <Building2 className="size-4" />
                          </span>
                          <div>
                            <p className="text-[13.5px] font-semibold text-ink">{a.name}</p>
                            {a.domain && <p className="text-[11.5px] text-faint">{a.domain}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-ink-soft">
                        {a.primaryContact ? (
                          <span className="inline-flex items-center gap-2">
                            <Avatar name={a.primaryContact.name} size={22} /> {a.primaryContact.name}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono text-[13px] text-ink-soft tnum">{a.contactCount}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-[13px] font-semibold text-ink tnum">{a.value > 0 ? `${formatINRCompact(a.value)}/mo` : "—"}</td>
                      <td className="px-5 py-3.5"><Badge tint={meta.tint}>{meta.label}</Badge></td>
                      <td className="px-5 py-3.5 text-right text-[12.5px] text-faint">{relativeTime(a.lastActivityAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <NewAccountModal open={creating} onClose={() => setCreating(false)} onCreated={() => refresh()} />
    </>
  );
}
