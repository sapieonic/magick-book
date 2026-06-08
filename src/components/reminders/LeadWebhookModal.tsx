"use client";
import { Modal } from "@/components/ui/Overlay";
import { PageLoader, ErrorState } from "@/components/ui/Misc";
import { WebhookForm } from "@/components/reminders/WebhookForm";
import { useToast } from "@/components/ui/Toast";
import { api, useApi } from "@/lib/client";
import type { ReminderSettingDTO } from "@/lib/types";

/**
 * Configure a webhook override for a single lead. When set + enabled, reminders
 * on this lead call this API instead of the user's default (Settings) webhook.
 */
export function LeadWebhookModal({
  open,
  leadId,
  leadName,
  onClose,
}: {
  open: boolean;
  leadId: string;
  leadName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data, loading, error, refresh } = useApi<{ setting: ReminderSettingDTO; defaultTemplate: string; hasOverride: boolean }>(
    open ? `/api/reminders/settings?leadId=${leadId}` : null,
  );
  if (!open) return null;

  async function remove() {
    try {
      await api.delete(`/api/reminders/settings?leadId=${leadId}`);
      toast("Override removed — this lead uses your default webhook.", "info");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't remove", "error");
    }
  }

  return (
    <Modal open onClose={onClose} title="Webhook for this lead" subtitle={`Reminders on ${leadName} call this API instead of your default.`} size="md">
      {error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : loading || !data ? (
        <PageLoader />
      ) : (
        <WebhookForm
          initial={data.setting}
          defaultTemplate={data.defaultTemplate}
          saveExtra={{ leadId }}
          onSaved={() => {
            toast("Lead webhook saved.", "success");
            onClose();
          }}
          onRemove={data.hasOverride ? remove : undefined}
        />
      )}
    </Modal>
  );
}
