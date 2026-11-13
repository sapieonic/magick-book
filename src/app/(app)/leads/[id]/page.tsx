"use client";
import { use, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Pencil } from "lucide-react";
import { Page, PageSplit } from "@/components/layout/Page";
import { PageHeader } from "@/components/layout/PageHeader";
import { useSession } from "@/components/layout/SessionContext";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { NoteComposer, type ComposerKind } from "@/components/activity/NoteComposer";
import { AddLeadDrawer } from "@/components/leads/AddLeadDrawer";
import { ConvertModal } from "@/components/leads/ConvertModal";
import { LostLeadModal } from "@/components/leads/LostLeadModal";
import { LeadDetailSkeleton } from "@/components/leads/detail/LeadDetailSkeleton";
import { LeadFacts } from "@/components/leads/detail/LeadFacts";
import { LeadHero } from "@/components/leads/detail/LeadHero";
import { LeadHistory } from "@/components/leads/detail/LeadHistory";
import { NextStepPanel } from "@/components/leads/detail/NextStepPanel";
import { StageTrack } from "@/components/leads/detail/StageTrack";
import { ReminderModal } from "@/components/reminders/ReminderModal";
import { LeadWebhookModal } from "@/components/reminders/LeadWebhookModal";
import { Badge, StatusPill } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Misc";
import { Panel } from "@/components/ui/Panel";
import { stageColor } from "@/components/ui/stage";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import { STAGE_META, isActiveLeadStage, type BoardStage } from "@/lib/constants";
import { daysSince, plural, shortDate } from "@/lib/utils";
import type { AuditLogDTO, LeadDTO, LeadDetail } from "@/lib/types";

const COMPOSER_KINDS: ComposerKind[] = ["call", "note", "email", "meeting", "whatsapp", "sms"];
const BREADCRUMB = [{ label: "Leads", href: "/leads" }];

function StageChip({ lead }: { lead: LeadDTO }) {
  if (lead.deletedAt) return <StatusPill tone="lost">Archived</StatusPill>;
  if (lead.stage === "won" || lead.stage === "lost" || lead.stage === "parked") return <StatusPill status={lead.stage} />;
  return <Badge dot={stageColor(lead.stage)}>{STAGE_META[lead.stage].label}</Badge>;
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const me = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data, loading, error, refresh } = useApi<LeadDetail>(`/api/leads/${id}`);
  const history = useApi<{ entries: AuditLogDTO[] }>(`/api/leads/${id}/audit`);
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [reminder, setReminder] = useState<{ title: string } | null>(null);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [busy, setBusy] = useState<"archive" | "restore" | null>(null);
  const [pendingStage, setPendingStage] = useState<BoardStage | null>(null);
  const [composerKind, setComposerKind] = useState<ComposerKind>(COMPOSER_KINDS[0]);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  if (loading) return <LeadDetailSkeleton />;
  if (error || !data) {
    return (
      <Page>
        <PageHeader title="Lead" breadcrumb={BREADCRUMB} />
        <Panel>
          <ErrorState message={error ?? "Lead not found"} onRetry={refresh} />
        </Panel>
      </Page>
    );
  }

  const { lead, activities, stages, nextStep } = data;
  const archived = !!lead.deletedAt;
  const converted = !!lead.convertedAccountId;
  const owns = me.role === "admin" || lead.ownerId === me.id;
  const canEdit = owns && !archived;
  const open = !converted && isActiveLeadStage(lead.stage) && lead.stage !== "won";
  const idle = daysSince(lead.lastActivityAt || lead.createdAt);
  const kindCount = (kind: "note" | "call") => activities.filter((a) => a.kind === kind).length;
  const activityMeta = (["note", "call"] as const)
    .filter((kind) => kindCount(kind) > 0)
    .map((kind) => plural(kindCount(kind), kind))
    .join(" · ");

  function reloadAll() {
    refresh();
    history.refresh();
  }

  async function moveStage(stage: BoardStage) {
    if (pendingStage || lead.stage === stage) return;
    setPendingStage(stage);
    try {
      await api.patch(`/api/leads/${id}/stage`, { stage });
      toast(`Moved to ${STAGE_META[stage].label}.`, "success");
      reloadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update stage", "error");
    } finally {
      setPendingStage(null);
    }
  }

  async function editNote(activityId: string, detail: string) {
    try {
      await api.patch(`/api/leads/${id}/activities/${activityId}`, { detail });
      toast("Note updated.", "success");
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update note", "error");
      throw err;
    }
  }

  async function archiveLead() {
    const ok = await confirm({
      title: "Archive this lead?",
      description: "It moves to the Archived view. You can restore it anytime; its activity and history are kept.",
      confirmLabel: "Archive",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("archive");
    try {
      await api.delete(`/api/leads/${id}`);
      toast("Lead archived.", "info");
      router.push("/leads");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't archive", "error");
      setBusy(null);
    }
  }

  async function restoreLead() {
    setBusy("restore");
    try {
      await api.patch(`/api/leads/${id}`, { action: "restore" });
      toast("Lead restored.", "success");
      reloadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't restore", "error");
    } finally {
      setBusy(null);
    }
  }

  function logCall() {
    setComposerKind("call");
    composerRef.current?.focus();
  }

  const heroActions = converted ? (
    <Link href={`/accounts/${lead.convertedAccountId}`} className={buttonClasses({ variant: "primary" })}>
      View account
    </Link>
  ) : (
    canEdit && (
      <>
        {lead.stage !== "parked" && lead.stage !== "lost" && (
          <Button onClick={() => moveStage("parked")} loading={pendingStage === "parked"} disabled={pendingStage !== null}>
            Park
          </Button>
        )}
        {lead.stage !== "lost" && (
          <Button onClick={() => setLostOpen(true)} disabled={pendingStage !== null}>
            Mark lost
          </Button>
        )}
        <Button variant="primary" onClick={() => setConverting(true)} disabled={lead.stage === "lost"}>
          Convert to account
        </Button>
      </>
    )
  );

  return (
    <Page>
      <PageHeader
        title={lead.name}
        breadcrumb={BREADCRUMB}
        actions={
          canEdit && (
            <>
              <Button variant="ghost" onClick={archiveLead} loading={busy === "archive"} aria-label="Archive lead">
                <Archive className="size-4" strokeWidth={1.5} aria-hidden />
                <span className="max-md:hidden">Archive</span>
              </Button>
              <Button onClick={() => setEditing(true)} aria-label="Edit lead">
                <Pencil className="size-4" strokeWidth={1.5} aria-hidden />
                <span className="max-md:hidden">Edit</span>
              </Button>
            </>
          )
        }
      >
        <StageChip lead={lead} />
      </PageHeader>

      {archived && (
        <Panel aria-label="Archived" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-2">
            Archived on <span className="tnum">{shortDate(lead.deletedAt!)}</span>. Its activity and history are kept.
          </p>
          {owns && (
            <Button variant="primary" onClick={restoreLead} loading={busy === "restore"}>
              Restore lead
            </Button>
          )}
        </Panel>
      )}

      <LeadHero lead={lead} open={open} actions={heroActions || undefined} />

      <StageTrack
        lead={lead}
        spans={stages}
        locked={!canEdit || converted}
        pending={pendingStage}
        onMove={moveStage}
        onConvert={() => setConverting(true)}
      />

      <PageSplit
        railLabel="Lead details"
        rail={
          <>
            {!archived && (
              <NextStepPanel
                leadId={id}
                step={nextStep}
                prompt={open}
                onChanged={refresh}
                onMoreOptions={(title) => setReminder({ title })}
                onWebhook={() => setWebhookOpen(true)}
              />
            )}
            <LeadFacts lead={lead} canEdit={canEdit} onSaved={reloadAll} />
            <LeadHistory entries={history.data?.entries ?? []} loading={history.loading} />
          </>
        }
      >
        {!archived && (
          <Panel aria-label="Log activity">
            <NoteComposer
              postUrl={`/api/leads/${id}/activities`}
              kinds={COMPOSER_KINDS}
              kind={composerKind}
              onKindChange={setComposerKind}
              inputRef={composerRef}
              onAdded={refresh}
              onRemind={(title) => setReminder({ title })}
            />
          </Panel>
        )}
        <Panel
          title="Activity"
          meta={activityMeta || undefined}
          actions={activities.length > 1 && <span className="text-ink-3">Newest first</span>}
          ruled
        >
          {open && !archived && idle > 30 && (
            <p className="mt-3 rounded-bar bg-due-tint px-3 py-2.5 text-[13px] text-ink-1">
              Nothing logged since <span className="tnum">{shortDate(lead.lastActivityAt || lead.createdAt)}</span>.{" "}
              <button type="button" onClick={logCall} className="font-medium underline">
                Log a call
              </button>{" "}
              or set a next step to bring this lead back into the queue.
            </p>
          )}
          <ActivityTimeline activities={activities} currentUserId={me.id} onEdit={archived ? undefined : editNote} collapseAfter={12} />
        </Panel>
      </PageSplit>

      {editing && (
        <AddLeadDrawer
          open
          lead={lead}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reloadAll();
          }}
        />
      )}
      {converting && (
        <ConvertModal lead={lead} open onClose={() => setConverting(false)} onConverted={(acc) => router.push(`/accounts/${acc.id}`)} />
      )}
      <LostLeadModal lead={lostOpen ? lead : null} onClose={() => setLostOpen(false)} onDone={reloadAll} />
      <ReminderModal
        open={!!reminder}
        leadId={id}
        entityName={lead.name}
        initialTitle={reminder?.title}
        onClose={() => setReminder(null)}
        onCreated={refresh}
      />
      <LeadWebhookModal open={webhookOpen} leadId={id} leadName={lead.name} onClose={() => setWebhookOpen(false)} />
    </Page>
  );
}
