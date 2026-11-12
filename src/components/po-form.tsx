import Link from "next/link";
import { savePurchaseOrder } from "@/app/procurement-actions";
import { ActionForm } from "./action-form";
import { LineItems, type LineDraft } from "./line-items";

/** Create or edit a draft purchase order. */
export function PoForm({
  poId,
  projects,
  projectId,
  requestId,
  suppliers,
  initial,
}: {
  poId?: string;
  projects: { id: string; name: string; code: string; location: string | null }[];
  projectId?: string;
  requestId?: string;
  suppliers: { id: string; name: string; supplies: string | null }[];
  initial: { supplierId?: string; expectedDate?: string; deliveryAddress?: string; notes?: string; lines: LineDraft[] };
}) {
  const fixedProject = projects.find((p) => p.id === projectId);
  return (
    <ActionForm action={savePurchaseOrder} submitLabel={poId ? "Save draft" : "Save as draft"} pendingLabel="Saving…" className="space-y-5">
      {poId ? <input type="hidden" name="poId" value={poId} /> : null}
      {requestId ? <input type="hidden" name="requestId" value={requestId} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fixedProject ? (
          <div>
            <span className="field-label">Project</span>
            <input type="hidden" name="projectId" value={fixedProject.id} />
            <p className="flex h-10 items-center md:h-9">{fixedProject.name}</p>
          </div>
        ) : (
          <div>
            <label htmlFor="po-project" className="field-label">Project</label>
            <select id="po-project" name="projectId" required className="field">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} {p.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="po-supplier" className="field-label">Supplier</label>
          {suppliers.length ? (
            <select id="po-supplier" name="supplierId" required defaultValue={initial.supplierId ?? ""} className="field">
              <option value="" disabled>Choose a supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.supplies ? `${s.name} (${s.supplies})` : s.name}</option>
              ))}
            </select>
          ) : (
            <p className="flex min-h-10 items-center text-negative">
              No suppliers yet.&nbsp;<Link href="/suppliers" className="underline">Add one first</Link>.
            </p>
          )}
        </div>
      </div>

      <LineItems initial={initial.lines} priced />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="po-expected" className="field-label">Deliver by</label>
          <input id="po-expected" name="expectedDate" type="date" defaultValue={initial.expectedDate ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor="po-address" className="field-label">Deliver to</label>
          <input id="po-address" name="deliveryAddress" defaultValue={initial.deliveryAddress ?? fixedProject?.location ?? ""} autoComplete="off" className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="po-notes" className="field-label">Notes for the supplier</label>
        <textarea id="po-notes" name="notes" rows={2} defaultValue={initial.notes ?? ""} className="field h-auto py-2" />
      </div>
    </ActionForm>
  );
}
