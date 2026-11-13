"use client";
import { useRef, useState, type ChangeEvent } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { formatMoney } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import type { InvoiceDTO } from "@/lib/types";
import { INVOICE_FILE_TYPES, uploadInvoiceFile } from "@/components/accounts/AccountModals";

function removeCopy(inv: InvoiceDTO): string {
  const amount = formatMoney(inv.amount);
  const tail = "The invoice number is kept and won't be reused.";
  if (inv.status === "paid") return `${amount} drops off the billed and paid totals. ${tail}`;
  if (inv.status === "draft") return `${amount} is a draft and not in any total. ${tail}`;
  return `${amount} drops off the billed and outstanding totals. ${tail}`;
}

/**
 * Invoice row actions shared by the statement and the Invoices tab: mark paid,
 * remind, remove (soft), open the stored file and attach or replace it. Render
 * `<input {...fileInputProps} />` once wherever `attachFile` is used.
 */
export function useInvoiceActions(onChanged: () => void | Promise<void>) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<string | null>(null);

  async function run(id: string, work: () => Promise<string>, refresh = true) {
    setBusyId(id);
    try {
      toast(await work(), "success");
      if (refresh) await onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = fileTarget.current;
    e.target.value = ""; // allow picking the same file again later
    if (!file || !id) return;
    await run(id, async () => {
      await uploadInvoiceFile(id, file);
      return "Invoice file stored.";
    });
  }

  return {
    busyId,
    markPaid: (inv: InvoiceDTO) =>
      run(inv.id, async () => {
        await api.patch(`/api/invoices/${inv.id}`, { status: "paid" });
        return `#${inv.number} marked paid.`;
      }),
    remind: (inv: InvoiceDTO) =>
      run(
        inv.id,
        async () => {
          await api.patch(`/api/invoices/${inv.id}`, { action: "remind" });
          return `Reminder sent for #${inv.number}.`;
        },
        false,
      ),
    async remove(inv: InvoiceDTO) {
      const ok = await confirm({ title: `Remove invoice #${inv.number}?`, description: removeCopy(inv), confirmLabel: "Remove invoice", tone: "danger" });
      if (!ok) return;
      await run(inv.id, async () => {
        await api.delete(`/api/invoices/${inv.id}`);
        return `Invoice #${inv.number} removed.`;
      });
    },
    openFile: (inv: InvoiceDTO) => window.open(`/api/invoices/${inv.id}/document`, "_blank", "noopener"),
    attachFile(inv: InvoiceDTO) {
      fileTarget.current = inv.id;
      fileInput.current?.click();
    },
    fileInputProps: {
      ref: fileInput,
      type: "file",
      accept: INVOICE_FILE_TYPES,
      className: "hidden",
      "aria-hidden": true,
      tabIndex: -1,
      onChange: onFile,
    } as const,
  };
}
