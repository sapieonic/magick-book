"use client";
import { useState, type Ref } from "react";
import { BellRing } from "lucide-react";
import { Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { KbdHint } from "@/components/ui/Misc";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";

/** Matches a `/remind [text]` command typed into the composer (text = first line). */
const REMIND_CMD = /^\/remind\b[ \t]*(.*)/i;

/** What the composer can log. `meeting` is accepted by the lead activities API and stored as a note. */
export type ComposerKind = "note" | "call" | "email" | "meeting" | "whatsapp" | "sms";

const KIND: Record<ComposerKind, { tab: string; action: string; placeholder: string }> = {
  call: { tab: "Call", action: "Log call", placeholder: "What happened on the call?" },
  note: { tab: "Note", action: "Add note", placeholder: "Add a progress note…" },
  email: { tab: "Email", action: "Log email", placeholder: "What did you send, or what came back?" },
  meeting: { tab: "Meeting", action: "Log meeting", placeholder: "Who met, and what was agreed?" },
  whatsapp: { tab: "WhatsApp", action: "Log WhatsApp", placeholder: "What did you send on WhatsApp?" },
  sms: { tab: "SMS", action: "Log SMS", placeholder: "What did you text?" },
};

/**
 * Timeline composer shared by the lead and account pages. Posts an activity of
 * the selected kind (just `note` unless `kinds` offers more) to `postUrl`, and
 * recognizes the inline `/remind` command: typing it switches to "reminder
 * mode" and hands the text off via `onRemind` (which opens a prefilled
 * reminder modal). Renders no surface of its own; place it in a Panel.
 */
export function NoteComposer({
  postUrl,
  onAdded,
  onRemind,
  kinds = ["note"],
  kind: controlledKind,
  onKindChange,
  inputRef,
}: {
  postUrl: string;
  onAdded: () => void;
  onRemind: (title: string) => void;
  /** Kinds offered as tabs (in order); the first is the default. */
  kinds?: ComposerKind[];
  /** Controlled selected kind, e.g. so a "Log a call" link can switch the composer. */
  kind?: ComposerKind;
  onKindChange?: (kind: ComposerKind) => void;
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const { toast } = useToast();
  const [ownKind, setOwnKind] = useState<ComposerKind>(kinds[0]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const kind = controlledKind ?? ownKind;
  const meta = KIND[kind];
  const remind = REMIND_CMD.exec(text);

  function selectKind(k: ComposerKind) {
    setOwnKind(k);
    onKindChange?.(k);
  }

  async function add() {
    const detail = text.trim();
    if (!detail) return;
    setBusy(true);
    try {
      await api.post(postUrl, { kind, detail });
      setText("");
      onAdded();
    } catch (err) {
      toast(err instanceof Error ? err.message : `Couldn't ${meta.action.toLowerCase()}`, "error");
    } finally {
      setBusy(false);
    }
  }

  function fireRemind() {
    if (!remind) return;
    onRemind(remind[1].trim()); // text after `/remind` prefills the reminder title
    setText("");
  }

  return (
    <div>
      {kinds.length > 1 && (
        <Tabs
          aria-label="Activity type"
          value={kind}
          onChange={selectKind}
          tabs={kinds.map((k) => ({ key: k, label: KIND[k].tab }))}
          className="mb-3"
        />
      )}
      <Textarea
        ref={inputRef}
        aria-label={kinds.length > 1 ? `${meta.tab} notes` : "Note"}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && remind) {
            e.preventDefault();
            fireRemind();
          } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            add();
          }
        }}
        placeholder={meta.placeholder}
        className="min-h-[76px]"
      />
      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
        {remind ? (
          <>
            <span className="mr-auto inline-flex items-center gap-1.5 text-[13px] text-ink-2">
              <BellRing className="size-4" strokeWidth={1.5} aria-hidden /> Reminder mode · press Enter to pick a time
            </span>
            <Button size="sm" variant="ghost" onClick={() => setText("")}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={fireRemind}>
              Set reminder
            </Button>
          </>
        ) : (
          <>
            <span className="mr-auto text-[12px] text-ink-3 max-md:hidden">
              <KbdHint>⌘ Enter</KbdHint> to post · type <span className="font-mono">/remind</span> for a reminder
            </span>
            {text.trim() && (
              <Button size="sm" variant="ghost" onClick={() => setText("")}>
                Clear
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={add} loading={busy} disabled={!text.trim()}>
              {meta.action}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
