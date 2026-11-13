"use client";
import { Avatar } from "@/components/ui/Avatar";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { DOCUMENT_KIND_META } from "@/lib/constants";
import { formatBytes } from "@/lib/utils";
import type { ActivityDTO, ContactDTO, DocumentDTO, ReminderDTO } from "@/lib/types";
import { DatedList, LinkButton } from "./parts";
import { shortDate } from "./statement";

export const openDocument = (accountId: string, docId: string) =>
  window.open(`/api/accounts/${accountId}/documents/${docId}`, "_blank", "noopener");

/** "Type · 412 KB · uploader · 12 May" under a document title. */
export function documentMeta(d: DocumentDTO): string {
  return [DOCUMENT_KIND_META[d.kind].label, formatBytes(d.fileSize), d.uploadedByName, shortDate(d.createdAt)].filter(Boolean).join(" · ");
}

/** One-line summary of an activity entry; notes show their text. */
export const activityLine = (a: ActivityDTO) => (a.kind === "note" ? `Note: ${a.detail}` : a.detail ? `${a.title} · ${a.detail}` : a.title);

export function PrimaryContactPanel({ contact, onAll, onAdd }: { contact: ContactDTO | null; onAll: () => void; onAdd: () => void }) {
  return (
    <Panel title="Primary contact" ruled actions={contact ? <LinkButton onClick={onAll}>All contacts</LinkButton> : <LinkButton onClick={onAdd}>Add</LinkButton>}>
      {contact ? (
        <>
          <div className="flex items-center gap-3 pb-2.5 pt-3">
            <Avatar name={contact.name} size={36} />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink-1">{contact.name}</div>
              {contact.title && <div className="truncate text-[13px] text-ink-3">{contact.title}</div>}
            </div>
          </div>
          {(contact.phone || contact.email) && (
            <p className="tnum break-words text-[13px] text-ink-2">{[contact.phone, contact.email].filter(Boolean).join(" · ")}</p>
          )}
          {(contact.phone || contact.email) && (
            <div className="mt-2.5 flex gap-2">
              {contact.phone && (
                <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className={buttonClasses({ size: "sm", className: "h-8 flex-1" })} aria-label={`Call ${contact.name}`}>
                  Call
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className={buttonClasses({ size: "sm", className: "h-8 flex-1" })} aria-label={`Email ${contact.name}`}>
                  Email
                </a>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="py-[9px] text-[13px] text-ink-3">No primary contact yet.</p>
      )}
    </Panel>
  );
}

export function DocumentsRailPanel({ accountId, documents, onUpload }: { accountId: string; documents: DocumentDTO[]; onUpload: () => void }) {
  return (
    <Panel title="Documents" ruled actions={<LinkButton onClick={onUpload}>Upload</LinkButton>}>
      {documents.length === 0 ? (
        <p className="py-[9px] text-[13px] text-ink-3">No proposals or agreements on file.</p>
      ) : (
        <ul>
          {documents.slice(0, 5).map((d) => (
            <li key={d.id} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => openDocument(accountId, d.id)} className="block w-full py-[9px] text-left hover:underline">
                <span className="block truncate text-ink-1">{d.title}</span>
                <span className="tnum block truncate text-[12px] text-ink-3">{documentMeta(d)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function RemindersPanel({ reminders, onAdd }: { reminders: ReminderDTO[]; onAdd: () => void }) {
  return (
    <Panel title="Reminders" ruled actions={<LinkButton onClick={onAdd}>Add</LinkButton>}>
      <DatedList
        empty="Nothing scheduled."
        items={reminders.map((r) => ({ key: r.id, date: shortDate(r.dueAt), text: r.title }))}
      />
    </Panel>
  );
}

export function RecentActivityPanel({ activities, onAll }: { activities: ActivityDTO[]; onAll: () => void }) {
  return (
    <Panel title="Recent activity" ruled actions={<LinkButton onClick={onAll}>All activity</LinkButton>}>
      <DatedList
        empty="No activity yet."
        items={activities.slice(0, 5).map((a) => ({ key: a.id, date: shortDate(a.createdAt), text: activityLine(a) }))}
      />
    </Panel>
  );
}
