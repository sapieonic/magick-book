"use client";
import { useRef, useState, type ChangeEvent } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { formatMoney } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/client";
import type { InvoiceDTO } from "@/lib/types";
import { INVOICE_FILE_TYPES, uploadInvoiceFile } from "@/components/accounts/AccountModals";

/** All Mark paid and Remind need: enough to call the API and name the invoice. */
export type InvoiceRef = Pick<InvoiceDTO, "id" | "number" | "amount">;

function removeCopy(inv: InvoiceDTO): string {
  const amount = formatMoney(inv.amount);
  const tail = "The invoice number is kept and won't be reused.";
  if (inv.status === "paid") return `${amount} drops off the billed and paid totals. ${tail}`;
  if (inv.status === "draft") return `${amount} is a draft and not in any total. ${tail}`;
  return `${amount} drops off the billed and outstanding totals. ${tail}`;
}

/**
 * The one set of invoice actions, so the account statement, its Invoices tab,
 * the Money ledger and Today's work queue behave alike.
 *
 * - `markPaid(inv)` asks for confirmation (a financial change with no undo),
 *   then PATCHes `status: "paid"`, toasts and calls `onChanged`.
 *   `onChanged` is for pages that don't reload on `useDataChanged`; a page
 *   that does (Today) omits it, or every action would reload it twice.
 * - `remind(inv)` logs a payment reminder on the account (nothing is
 *   delivered) and toasts "Reminder logged for #N". No refresh.
 * - `remove(inv)` confirms, then soft-deletes the invoice.
 * - `openFile` / `attachFile` open or upload the stored file; render
 *   `<input {...fileInputProps} />` once wherever `attachFile` is used.
 * - `busyId` is the id of the invoice whose request is in flight.
 *
 * `markPaid` and `remind` take only `{ id, number, amount }`, so a caller
 * holding a work-queue item rather than a full invoice can use them.
 */
export function useInvoiceActions(onChanged?: () => void | Promise<void>) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<string | null>(null);

  async function run(id: string, work: () => Promise<string>, refresh = true) {
    setBusyId(id);
    try {
      toast(await work(), "success");
      if (refresh) await onChanged?.();
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
    async markPaid(inv: InvoiceRef) {
      const ok = await confirm({
        title: `Mark invoice #${inv.number} (${formatMoney(inv.amount)}) as paid?`,
        description: "It moves from outstanding to paid, dated today.",
        confirmLabel: "Mark paid",
      });
      if (!ok) return;
      await run(inv.id, async () => {
        await api.patch(`/api/invoices/${inv.id}`, { status: "paid" });
        return `#${inv.number} marked paid.`;
      });
    },
    remind: (inv: InvoiceRef) =>
      run(
        inv.id,
        async () => {
          await api.patch(`/api/invoices/${inv.id}`, { action: "remind" });
          return `Reminder logged for #${inv.number}.`;
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
    openFile: (inv: Pick<InvoiceDTO, "id">) => window.open(`/api/invoices/${inv.id}/document`, "_blank", "noopener"),
    attachFile(inv: Pick<InvoiceDTO, "id">) {
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
