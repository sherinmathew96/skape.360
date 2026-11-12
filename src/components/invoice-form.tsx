import { saveInvoice } from "@/app/finance-actions";
import { formatDate } from "@/lib/dates";
import { DEFAULT_SAC } from "@/lib/gst";
import { ActionForm } from "./action-form";
import { InvoiceLines, type InvoiceLineDraft } from "./invoice-lines";

/** New or draft invoice. The number is given when it is issued. */
export function InvoiceForm({
  invoiceId,
  projectId,
  milestones,
  studioState,
  initial,
}: {
  invoiceId?: string;
  projectId: string;
  milestones: { id: string; name: string; dueDate: string; done: boolean }[];
  studioState: string;
  initial: { milestoneId?: string; placeOfSupply: string; dueDate?: string; notes?: string; lines: InvoiceLineDraft[] };
}) {
  return (
    <ActionForm action={saveInvoice} submitLabel={invoiceId ? "Save draft" : "Save as draft"} pendingLabel="Saving…" className="space-y-5">
      {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}
      <input type="hidden" name="projectId" value={projectId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="inv-milestone" className="field-label">For milestone</label>
          <select id="inv-milestone" name="milestoneId" defaultValue={initial.milestoneId ?? ""} className="field">
            <option value="">Not tied to a milestone</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.done ? "reached" : `due ${formatDate(m.dueDate)}`})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="inv-due" className="field-label">Payment due</label>
          <input id="inv-due" name="dueDate" type="date" defaultValue={initial.dueDate ?? ""} aria-describedby="due-help" className="field" />
          <p id="due-help" className="mt-2 text-xs text-muted">Leave empty for 15 days after issue.</p>
        </div>
      </div>

      <InvoiceLines initial={initial.lines} defaultSac={DEFAULT_SAC} studioState={studioState} initialPlace={initial.placeOfSupply} />

      <div>
        <label htmlFor="inv-notes" className="field-label">Note on the invoice</label>
        <textarea id="inv-notes" name="notes" rows={2} defaultValue={initial.notes ?? ""} className="field h-auto py-2" />
      </div>
    </ActionForm>
  );
}
