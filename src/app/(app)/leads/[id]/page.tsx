"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone,
  MessageCircle,
  Mail,
  MessageSquare,
  Check,
  Pencil,
  ArrowRight,
  Ban,
  Building2,
  ChevronRight,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/layout/Sidebar";
import { useSession } from "@/components/layout/SessionContext";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { AddLeadDrawer } from "@/components/leads/AddLeadDrawer";
import { ConvertModal } from "@/components/leads/ConvertModal";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PageLoader, ErrorState } from "@/components/ui/Misc";
import { Modal } from "@/components/ui/Overlay";
import { Textarea, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import { PIPELINE_STAGES, STAGE_META } from "@/lib/constants";
import { formatINR, cn } from "@/lib/utils";
import type { LeadDTO, ActivityDTO } from "@/lib/types";

interface LeadResponse {
  lead: LeadDTO;
  activities: ActivityDTO[];
}

const REACH = [
  { method: "call", label: "Call", icon: Phone },
  { method: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { method: "email", label: "Email", icon: Mail },
  { method: "sms", label: "SMS", icon: MessageSquare },
] as const;

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, error, refresh } = useApi<LeadResponse>(`/api/leads/${id}`);
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [reach, setReach] = useState<(typeof REACH)[number] | null>(null);

  if (loading) return <PageLoader label="Loading lead…" />;
  if (error || !data) return <div className="p-8"><ErrorState message={error ?? "Lead not found"} onRetry={refresh} /></div>;

  const { lead, activities } = data;
  const meta = STAGE_META[lead.stage];
  const converted = !!lead.convertedAccountId;

  async function moveStage(stage: string) {
    try {
      await api.patch(`/api/leads/${id}/stage`, { stage });
      toast(`Moved to ${STAGE_META[stage as keyof typeof STAGE_META].label}.`, "success");
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update stage", "error");
    }
  }

  return (
    <>
      <PageHeader>
        <nav className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
          <Link href="/leads" className="hover:text-ink">Leads</Link>
          <ChevronRight className="size-3.5 text-faint" />
          <span className="truncate font-display text-[20px] font-bold tracking-tight text-ink">{lead.name}</span>
          <Badge tint={meta.tint} dot={meta.dot} className="ml-1">{meta.label}</Badge>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)} aria-label="Edit lead">
            <Pencil className="size-4" /> <span className="hidden sm:inline">Edit</span>
          </Button>
          {converted ? (
            <Button variant="primary" onClick={() => router.push(`/accounts/${lead.convertedAccountId}`)}>
              <Building2 className="size-4" /> <span className="hidden sm:inline">View account</span><span className="sm:hidden">Account</span>
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setConverting(true)} disabled={lead.stage === "lost"}>
              <span className="hidden sm:inline">Convert to account</span><span className="sm:hidden">Convert</span> <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-[1100px]">
          {/* Stage stepper */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            {PIPELINE_STAGES.map((s, i) => {
              const idx = PIPELINE_STAGES.indexOf(lead.stage as never);
              const done = idx > i;
              const current = lead.stage === s;
              return (
                <button
                  key={s}
                  onClick={() => moveStage(s)}
                  disabled={converted}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-all disabled:cursor-not-allowed",
                    current
                      ? "border-violet-400 bg-violet-50 text-violet-700 shadow-[0_0_0_3px_rgba(109,92,245,0.1)]"
                      : done
                        ? "border-success/30 bg-success-bg text-success"
                        : "border-line-strong bg-paper text-muted hover:border-violet-300 hover:text-violet-600",
                  )}
                >
                  {done && <Check className="size-3.5" />}
                  {STAGE_META[s].label}
                </button>
              );
            })}
            <button
              onClick={() => setLostOpen(true)}
              disabled={converted || lead.stage === "lost"}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3.5 py-1.5 text-[12.5px] font-semibold text-muted transition-all hover:border-danger/40 hover:bg-danger-bg hover:text-danger disabled:opacity-40"
            >
              <Ban className="size-3.5" /> {lead.stage === "lost" ? "Lost" : "Mark lost"}
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
            {/* Left: contact + reach out */}
            <div className="space-y-5">
              <Card className="p-6 text-center">
                <Avatar name={lead.name} size={72} className="mx-auto" />
                <h2 className="mt-3 font-display text-[19px] font-bold text-ink">{lead.name}</h2>
                {(lead.title || lead.company) && (
                  <p className="text-[12.5px] text-muted">
                    {[lead.title, lead.company].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div className="my-4 border-t border-dashed border-line" />
                <dl className="space-y-2.5 text-left text-[13px]">
                  {lead.phone && <Row icon={<Phone className="size-3.5" />} value={lead.phone} />}
                  {lead.email && <Row icon={<Mail className="size-3.5" />} value={lead.email} />}
                  <Row label="Source" value={lead.source} />
                  <Row label="Owner" value={lead.ownerName} />
                  {lead.estValue > 0 && <Row label="Est." value={<span className="font-mono font-semibold tnum">{formatINR(lead.estValue)}</span>} bold />}
                </dl>
              </Card>

              <Card className="p-5">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Reach out</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {REACH.map((r) => (
                    <button
                      key={r.method}
                      onClick={() => setReach(r)}
                      className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-line-strong py-2.5 text-[13px] font-semibold text-ink-soft transition-all hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700"
                    >
                      <r.icon className="size-4" /> {r.label}
                    </button>
                  ))}
                </div>
              </Card>
            </div>

            {/* Right: timeline */}
            <Card className="p-6">
              <h2 className="mb-4 font-display text-[16px] font-bold text-ink">Lifecycle &amp; activity</h2>
              <NoteComposer leadId={id} onAdded={refresh} />
              {lead.notes && (
                <div className="mb-5 rounded-[var(--radius-md)] border border-line bg-canvas/60 p-3.5 text-[13px] leading-relaxed text-ink-soft">
                  {lead.notes}
                </div>
              )}
              <ActivityTimeline activities={activities} />
            </Card>
          </div>
        </div>
      </div>

      {editing && (
        <AddLeadDrawer
          open
          lead={lead}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}
      {converting && (
        <ConvertModal
          lead={lead}
          open
          onClose={() => setConverting(false)}
          onConverted={(acc) => router.push(`/accounts/${acc.id}`)}
        />
      )}
      <LogModal
        leadId={id}
        reach={reach}
        onClose={() => setReach(null)}
        onDone={() => {
          setReach(null);
          refresh();
        }}
      />
      <LostModal open={lostOpen} leadId={id} name={lead.name} onClose={() => setLostOpen(false)} onDone={() => { setLostOpen(false); refresh(); }} />
    </>
  );
}

// (helper components below)

function NoteComposer({ leadId, onAdded }: { leadId: string; onAdded: () => void }) {
  const me = useSession();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const text = note.trim();
    if (!text) return;
    setBusy(true);
    try {
      await api.post(`/api/leads/${leadId}/activities`, { kind: "note", detail: text });
      setNote("");
      onAdded();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't add note", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 flex gap-3">
      <Avatar name={me.name} size={32} className="mt-0.5" />
      <div className="flex-1">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add();
          }}
          placeholder="Add a progress note… (⌘/Ctrl + Enter to post)"
          className="min-h-[56px] text-[13px]"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {note.trim() && (
            <button type="button" onClick={() => setNote("")} className="text-[12.5px] font-medium text-muted hover:text-ink">
              Clear
            </button>
          )}
          <Button size="sm" variant="primary" onClick={add} loading={busy} disabled={!note.trim()}>
            <Plus className="size-3.5" /> Add note
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value, bold }: { icon?: React.ReactNode; label?: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-muted">
        {icon}
        {label && <span>{label}</span>}
      </span>
      <span className={cn("truncate text-ink-soft", bold && "font-semibold text-ink")}>{value}</span>
    </div>
  );
}

function LogModal({
  leadId,
  reach,
  onClose,
  onDone,
}: {
  leadId: string;
  reach: { method: string; label: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  if (!reach) return null;

  async function submit() {
    if (!reach) return;
    setBusy(true);
    try {
      await api.post(`/api/leads/${leadId}/activities`, { kind: reach.method, detail: detail.trim() });
      toast(`${reach.label} logged.`, "success");
      setDetail("");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't log", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Log ${reach.label.toLowerCase()}`} subtitle="Add a quick note so it lands on the timeline." size="sm">
      <Field label="What happened?">
        <Textarea autoFocus placeholder={`Summary of the ${reach.label.toLowerCase()}…`} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </Field>
      <div className="mt-5 flex gap-3">
        <Button variant="primary" onClick={submit} loading={busy}>Log {reach.label.toLowerCase()}</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

function LostModal({ open, leadId, name, onClose, onDone }: { open: boolean; leadId: string; name: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function submit() {
    setBusy(true);
    try {
      await api.patch(`/api/leads/${leadId}/stage`, { stage: "lost", lostReason: reason.trim() });
      toast(`${name} marked lost.`, "info");
      setReason("");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Mark as lost" subtitle={`What happened with ${name}?`} size="sm">
      <Field label="Reason" hint="helps you learn">
        <Textarea autoFocus placeholder="budget, timing, went with competitor…" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-5 flex gap-3">
        <Button variant="danger" onClick={submit} loading={busy}>Mark lost</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
