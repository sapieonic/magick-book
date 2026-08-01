"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Tags, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { useSession } from "@/components/layout/SessionContext";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { CategoryBadge } from "@/components/leads/CategoryBadge";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Field";
import { Card, PageLoader, ErrorState, EmptyState } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { api, useApi } from "@/lib/client";
import { DEFAULT_LEAD_CATEGORY, formatCategoryLabel } from "@/lib/constants";

interface CategoriesResponse {
  categories: string[];
  counts: Record<string, number>;
  orphans: { category: string; count: number }[];
  isAdmin: boolean;
}

export default function CategoriesSettingsPage() {
  const me = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data, loading, error, refresh } = useApi<CategoriesResponse>("/api/workspace/categories");
  const [categories, setCategories] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [orphans, setOrphans] = useState<{ category: string; count: number }[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.categories) setCategories(data.categories);
    if (data?.counts) setCounts(data.counts);
    if (data?.orphans) setOrphans(data.orphans);
  }, [data?.categories, data?.counts, data?.orphans]);

  const canManage = data?.isAdmin ?? me.role === "admin";

  async function persist(next: string[]) {
    setBusy(true);
    try {
      const res = await api.put<CategoriesResponse>("/api/workspace/categories", { categories: next });
      setCategories(res.categories);
      setCounts(res.counts ?? {});
      setOrphans(res.orphans ?? []);
      toast("Categories updated.", "success");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save categories", "error");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
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
    if (slug === DEFAULT_LEAD_CATEGORY) {
      toast("Unclassified can't be removed.", "info");
      return;
    }
    const n = counts[slug] ?? 0;
    const ok = await confirm({
      title: `Remove “${formatCategoryLabel(slug)}”?`,
      description:
        n > 0
          ? `${n} ${n === 1 ? "lead still uses" : "leads still use"} this. They keep the tag — you'll see them under “Needs reclassify” below so you can update them.`
          : "No leads use this category. It will disappear from the dropdown.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    await persist(categories.filter((c) => c !== slug));
  }

  return (
    <>
      <PageHeader>
        <nav className="flex items-center gap-1.5 text-[13px] text-muted">
          <span>Settings</span>
          <span className="text-faint">/</span>
          <span className="font-display text-[20px] font-bold tracking-tight text-ink">Lead categories</span>
        </nav>
      </PageHeader>

      <SettingsTabs />

      <div className="px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-[640px] space-y-6">
          {error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : loading ? (
            <PageLoader />
          ) : (
            <>
              <Card className="p-6">
                <div className="mb-5 flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-violet-100 text-violet-700">
                    <Tags className="size-[18px]" />
                  </span>
                  <div>
                    <h2 className="font-display text-[16px] font-bold text-ink">Classification</h2>
                    <p className="text-[12.5px] text-muted">
                      Tag leads by industry or vertical so the pipeline is easier to scan. New leads default to Unclassified.
                    </p>
                  </div>
                </div>

                {categories.length === 0 ? (
                  <EmptyState title="No categories yet" description="Add your first classification below." />
                ) : (
                  <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
                    {categories.map((c) => {
                      const n = counts[c] ?? 0;
                      return (
                        <li key={c} className="flex items-center gap-3 px-4 py-3">
                          <CategoryBadge category={c} />
                          <Link
                            href={`/leads?category=${encodeURIComponent(c)}`}
                            className="text-[12.5px] font-medium text-muted transition-colors hover:text-violet-700"
                          >
                            {n} {n === 1 ? "lead" : "leads"}
                            <ExternalLink className="ml-1 inline size-3 opacity-60" />
                          </Link>
                          {canManage && c !== DEFAULT_LEAD_CATEGORY && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-auto text-muted hover:text-danger"
                              disabled={busy}
                              onClick={() => removeCategory(c)}
                              aria-label={`Remove ${c}`}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                          {c === DEFAULT_LEAD_CATEGORY && (
                            <span className="ml-auto text-[11.5px] font-medium text-faint">Default</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {canManage ? (
                  <form
                    className="mt-5 flex items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addCategory();
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <Field label="Add category" hint="press Enter">
                        <Input
                          placeholder="e.g. telecom"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          maxLength={40}
                          disabled={busy}
                          autoFocus
                        />
                      </Field>
                    </div>
                    <Button type="submit" variant="primary" loading={busy} disabled={!draft.trim()}>
                      <Plus className="size-4" /> Add
                    </Button>
                  </form>
                ) : (
                  <p className="mt-4 text-[12.5px] text-muted">Only admins can add or remove categories.</p>
                )}
              </Card>

              {orphans.length > 0 && (
                <Card className="p-6">
                  <h3 className="font-display text-[15px] font-bold text-ink">Needs reclassify</h3>
                  <p className="mt-1 text-[12.5px] text-muted">
                    These tags were removed from the dropdown but are still on leads. Open the list to update them.
                  </p>
                  <ul className="mt-4 divide-y divide-line rounded-[var(--radius-md)] border border-line">
                    {orphans.map((o) => (
                      <li key={o.category} className="flex items-center gap-3 px-4 py-3">
                        <CategoryBadge category={o.category} />
                        <Link
                          href={`/leads?category=${encodeURIComponent(o.category)}`}
                          className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-violet-700 hover:underline"
                        >
                          {o.count} {o.count === 1 ? "lead" : "leads"}
                          <ExternalLink className="size-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
