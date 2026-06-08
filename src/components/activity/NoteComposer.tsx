"use client";
import { useState } from "react";
import { BellRing, Plus } from "lucide-react";
import { useSession } from "@/components/layout/SessionContext";
import { Avatar } from "@/components/ui/Avatar";
import { Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";

/** Matches a `/remind [text]` command typed into the composer (text = first line). */
const REMIND_CMD = /^\/remind\b[ \t]*(.*)/i;

/**
 * Timeline note composer shared by lead + account pages. Posts a `note` activity
 * to `postUrl`, and recognizes the inline `/remind` command: typing it switches
 * the composer to "reminder mode" and hands the text off via `onRemind` (which
 * opens a prefilled reminder modal).
 */
export function NoteComposer({
  postUrl,
  onAdded,
  onRemind,
}: {
  postUrl: string;
  onAdded: () => void;
  onRemind: (title: string) => void;
}) {
  const me = useSession();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const remind = REMIND_CMD.exec(note);

  async function add() {
    const text = note.trim();
    if (!text) return;
    setBusy(true);
    try {
      await api.post(postUrl, { kind: "note", detail: text });
      setNote("");
      onAdded();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't add note", "error");
    } finally {
      setBusy(false);
    }
  }

  function fireRemind() {
    if (!remind) return;
    onRemind(remind[1].trim()); // text after `/remind` prefills the reminder title
    setNote("");
  }

  return (
    <div className="mb-5 flex gap-3">
      <Avatar name={me.name} size={32} className="mt-0.5" />
      <div className="flex-1">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && remind) {
              e.preventDefault();
              fireRemind();
            } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              add();
            }
          }}
          placeholder="Add a progress note… (⌘/Ctrl + Enter to post · type /remind to set a reminder)"
          className="min-h-[56px] text-[13px]"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {remind ? (
            <>
              <span className="mr-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-violet-600">
                <BellRing className="size-3.5" /> Reminder mode · press Enter to set the time
              </span>
              <button type="button" onClick={() => setNote("")} className="text-[12.5px] font-medium text-muted hover:text-ink">
                Cancel
              </button>
              <Button size="sm" variant="primary" onClick={fireRemind}>
                <BellRing className="size-3.5" /> Set reminder
              </Button>
            </>
          ) : (
            <>
              {note.trim() && (
                <button type="button" onClick={() => setNote("")} className="text-[12.5px] font-medium text-muted hover:text-ink">
                  Clear
                </button>
              )}
              <Button size="sm" variant="primary" onClick={add} loading={busy} disabled={!note.trim()}>
                <Plus className="size-3.5" /> Add note
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
