import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { saveSupplier } from "@/app/procurement-actions";
import { ActionForm } from "@/components/action-form";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listSuppliers } from "@/lib/procurement";

export const metadata: Metadata = { title: "Suppliers" };

type Props = { searchParams: Promise<{ edit?: string }> };

function SupplierFields({ s }: { s?: Awaited<ReturnType<typeof listSuppliers>>[number] }) {
  const p = s ? `e-${s.id.slice(0, 6)}` : "n";
  return (
    <>
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <div>
        <label htmlFor={`${p}-name`} className="field-label">Business name</label>
        <input id={`${p}-name`} name="name" required defaultValue={s?.name} autoComplete="off" className="field" />
      </div>
      <div>
        <label htmlFor={`${p}-supplies`} className="field-label">Supplies</label>
        <input id={`${p}-supplies`} name="supplies" defaultValue={s?.supplies ?? ""} placeholder="e.g. Cement, steel, aggregates" autoComplete="off" className="field" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${p}-contact`} className="field-label">Contact person</label>
          <input id={`${p}-contact`} name="contactName" defaultValue={s?.contactName ?? ""} autoComplete="off" className="field" />
        </div>
        <div>
          <label htmlFor={`${p}-phone`} className="field-label">Phone</label>
          <input id={`${p}-phone`} name="phone" type="tel" defaultValue={s?.phone ?? ""} autoComplete="off" className="field" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${p}-email`} className="field-label">Email</label>
          <input id={`${p}-email`} name="email" type="email" defaultValue={s?.email ?? ""} autoComplete="off" spellCheck={false} className="field" />
        </div>
        <div>
          <label htmlFor={`${p}-gstin`} className="field-label">GSTIN</label>
          <input id={`${p}-gstin`} name="gstin" defaultValue={s?.gstin ?? ""} maxLength={15} spellCheck={false} className="field font-mono uppercase" />
        </div>
      </div>
      <div>
        <label htmlFor={`${p}-address`} className="field-label">Address</label>
        <textarea id={`${p}-address`} name="address" rows={2} defaultValue={s?.address ?? ""} className="field h-auto py-2" />
      </div>
      {s ? (
        <div>
          <label htmlFor={`${p}-active`} className="field-label">Status</label>
          <select id={`${p}-active`} name="active" defaultValue={s.active ? "1" : "0"} className="field">
            <option value="1">Active</option>
            <option value="0">Not used any more</option>
          </select>
        </div>
      ) : null}
    </>
  );
}

export default async function SuppliersPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!can(user.role, "procurement.manage")) redirect("/");
  const suppliers = await listSuppliers();
  const editId = (await searchParams).edit;
  const editing = suppliers.find((x) => x.id === editId);
  const active = suppliers.filter((x) => x.active).length;

  return (
    <div className="mx-auto max-w-[1136px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Suppliers</h1>
        <p className="num mt-1 text-muted">
          {active} active {active === 1 ? "supplier" : "suppliers"}
          {suppliers.length > active ? `, ${suppliers.length - active} not used any more` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card" aria-label="Supplier list">
          {suppliers.length === 0 ? (
            <p className="empty m-5">No suppliers yet. Add the ones you buy from regularly.</p>
          ) : (
            <ul>
              {suppliers.map((x) => (
                <li key={x.id} className={`flex items-start gap-3 border-t border-rule px-5 py-3 first:border-t-0 ${x.active ? "" : "text-muted"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{x.name}</p>
                    <p className="truncate text-xs leading-5 text-muted">
                      {[x.supplies, x.contactName, x.phone].filter(Boolean).join(" · ") || "No details yet"}
                    </p>
                    {x.gstin ? <p className="font-mono text-xs text-muted">GSTIN {x.gstin}</p> : null}
                  </div>
                  <p className="num flex-none text-right text-xs text-muted">
                    {x.orders} {x.orders === 1 ? "order" : "orders"}
                    {!x.active ? <span className="block">Not used</span> : null}
                  </p>
                  <Link href={`/suppliers?edit=${x.id}`} className="btn btn-quiet h-9 flex-none" aria-label={`Edit ${x.name}`}>Edit</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5" aria-labelledby="supplier-form-title">
          <h2 id="supplier-form-title" className="card-title mb-4">{editing ? `Edit ${editing.name}` : "Add a supplier"}</h2>
          <ActionForm key={editing?.id ?? "new"} action={saveSupplier} submitLabel={editing ? "Save changes" : "Add supplier"} pendingLabel="Saving…" className="space-y-4">
            <SupplierFields s={editing} />
          </ActionForm>
          {editing ? <Link href="/suppliers" className="mt-3 inline-block text-muted hover:text-text hover:underline">Cancel</Link> : null}
        </section>
      </div>
    </div>
  );
}
