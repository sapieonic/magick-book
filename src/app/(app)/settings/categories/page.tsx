"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Tags, Trash2 } from "lucide-react";
import { PageSplit } from "@/components/layout/Page";
import { useSession } from "@/components/layout/SessionContext";
import { SettingsHeader } from "@/components/settings/SettingsTabs";
import { CategoryBadge } from "@/components/leads/CategoryBadge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Field, Input } from "@/components/ui/Field";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/ui/Misc";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import { plural } from "@/lib/utils";
import { DEFAULT_LEAD_CATEGORY, formatCategoryLabel } from "@/lib/constants";

interface CategoriesResponse {
  categories: string[];
  counts: Record<string, number>;
  orphans: { category: string; count: number }[];
  isAdmin: boolean;
}

const leadsHref = (category: string) => `/leads?category=${encodeURIComponent(category)}`;
const leadCount = (n: number) => plural(n, "lead");

export default function CategoriesSettingsPage() {
  const me = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data, setData, loading, error, refresh } = useApi<CategoriesResponse>("/api/workspace/categories");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const categories = data?.categories ?? [];
  const counts = data?.counts ?? {};
  const orphans = data?.orphans ?? [];
  const canManage = data?.isAdmin ?? me.role === "admin";

  async function persist(next: string[]) {
    setBusy(true);
    try {
      const res = await api.put<Omit<CategoriesResponse, "isAdmin">>("/api/workspace/categories", { categories: next });
      setData((cur) => (cur ? { ...cur, ...res } : cur));
      toast("Categories updated.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save categories", "error");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const slug = draft.trim().toLowerCase().replace(/\s+/g, " ");
    if (!slug) return;
    if (categories.includes(slug)) {
      toast("That category already exists.", "info");
      return;
    }
    setDraft("");
    await persist([...categories, slug]);
  }

  async function removeCategory(slug: string) {
    const n = counts[slug] ?? 0;
    const ok = await confirm({
      title: `Remove “${formatCategoryLabel(slug)}”?`,
      description:
        n > 0
          ? `${leadCount(n)} still ${n === 1 ? "uses" : "use"} this. They keep the tag, and show under “Needs reclassify” so you can update them.`
          : "No leads use this category. It disappears from the dropdown.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (ok) await persist(categories.filter((c) => c !== slug));
  }

  return (
    <>
      <SettingsHeader title="Lead categories" />

      {error ? (
        <Panel>
          <ErrorState message={error} onRetry={refresh} />
        </Panel>
      ) : (
        <PageSplit
          railLabel="Manage categories"
          rail={
            <>
              <Panel title="Add a category" ruled className={orphans.length ? undefined : "md:col-span-2"}>
                {canManage ? (
                  <form className="mt-3 flex items-end gap-2" onSubmit={addCategory}>
                    <Field label="Name" hint="Enter to add" className="min-w-0 flex-1">
                      <Input placeholder="e.g. telecom" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} disabled={busy} />
                    </Field>
                    <Button type="submit" variant="primary" loading={busy} disabled={!draft.trim()}>
                      <Plus className="size-4" strokeWidth={1.5} aria-hidden /> Add
                    </Button>
                  </form>
                ) : (
                  <p className="mt-3 text-[13px] text-ink-2">Only admins can add or remove categories.</p>
                )}
                <p className="mt-3 text-[13px] text-ink-3">
                  Tag leads by industry or vertical so the pipeline is easier to scan. New leads start as Unclassified.
                </p>
              </Panel>
              {orphans.length > 0 && (
                <Panel title="Needs reclassify" meta={orphans.length} ruled>
                  <p className="mt-2 text-[13px] text-ink-3">Removed from the dropdown but still on leads. Open the list to update them.</p>
                  <ul className="mt-1">
                    {orphans.map((o) => (
                      <li key={o.category} className="flex items-center justify-between gap-3 border-b border-line py-[9px] last:border-b-0">
                        <CategoryBadge category={o.category} />
                        <Link href={leadsHref(o.category)} className="link tnum text-[13px]">
                          {leadCount(o.count)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          }
        >
          <Panel title="Categories" meta={loading ? undefined : categories.length} ruled>
            {loading ? (
              <RowsSkeleton rows={4} label="Loading categories" />
            ) : categories.length === 0 ? (
              <EmptyState
                className="mt-3"
                icon={<Tags className="size-6" strokeWidth={1.5} aria-hidden />}
                title="No categories yet"
                description="Add your first classification to start tagging leads."
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Category</Th>
                    <Th numeric>Leads</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c}>
                      <Td>
                        <CategoryBadge category={c} />
                      </Td>
                      <Td numeric>
                        <Link href={leadsHref(c)} className="link" aria-label={`${leadCount(counts[c] ?? 0)} in ${formatCategoryLabel(c)}`}>
                          {counts[c] ?? 0}
                        </Link>
                      </Td>
                      <Td className="w-24 text-right">
                        {c === DEFAULT_LEAD_CATEGORY ? (
                          <span className="text-[13px] text-ink-3">Default</span>
                        ) : (
                          canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => removeCategory(c)}
                              aria-label={`Remove ${formatCategoryLabel(c)}`}
                            >
                              <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
                            </Button>
                          )
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </PageSplit>
      )}
    </>
  );
}
