import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { saveInvoiceSettings } from "@/app/finance-actions";
import { saveSettings } from "@/app/procurement-actions";
import { GST_STATES } from "@/lib/gst";
import { ActionForm } from "@/components/action-form";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getBusinessSettings } from "@/lib/procurement";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  if (!can(user, "staff.manage")) redirect("/");
  const b = await getBusinessSettings();

  return (
    <div className="mx-auto max-w-[1136px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Settings</h1>
        <p className="mt-1 text-muted">What prints on purchase orders and invoices. Only admins can change this.</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card p-5" aria-labelledby="business-title">
          <h2 id="business-title" className="card-title mb-4">Business details</h2>
          <ActionForm action={saveSettings} submitLabel="Save" pendingLabel="Saving…" className="space-y-4">
            <div>
              <label htmlFor="companyName" className="field-label">Business name</label>
              <input id="companyName" name="companyName" required defaultValue={b.companyName} autoComplete="organization" className="field" />
            </div>
            <div>
              <label htmlFor="address" className="field-label">Address</label>
              <textarea id="address" name="address" rows={3} defaultValue={b.address ?? ""} autoComplete="street-address" className="field h-auto py-2" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="gstin" className="field-label">GSTIN</label>
                <input id="gstin" name="gstin" defaultValue={b.gstin ?? ""} maxLength={15} autoCapitalize="characters" spellCheck={false} aria-describedby="gstin-help" className="field font-mono uppercase" />
                <p id="gstin-help" className="mt-2 text-xs text-muted">15 letters and digits. Leave empty if not registered.</p>
              </div>
              <div>
                <label htmlFor="phone" className="field-label">Phone</label>
                <input id="phone" name="phone" type="tel" defaultValue={b.phone ?? ""} autoComplete="tel" className="field" />
              </div>
            </div>
            <div>
              <label htmlFor="email" className="field-label">Email</label>
              <input id="email" name="email" type="email" defaultValue={b.email ?? ""} autoComplete="email" spellCheck={false} className="field" />
            </div>
            <div>
              <label htmlFor="poTerms" className="field-label">Purchase order terms</label>
              <textarea
                id="poTerms"
                name="poTerms"
                rows={5}
                defaultValue={b.poTerms ?? ""}
                aria-describedby="terms-help"
                className="field h-auto py-2"
              />
              <p id="terms-help" className="mt-2 text-xs text-muted">Printed at the foot of every order: payment terms, delivery hours, quality conditions.</p>
            </div>
          </ActionForm>
        </section>

        <div className="grid grid-cols-1 gap-3">
        <section className="card p-5" aria-labelledby="invoice-settings-title">
          <h2 id="invoice-settings-title" className="card-title mb-4">Invoices</h2>
          <ActionForm action={saveInvoiceSettings} submitLabel="Save" pendingLabel="Saving…" className="space-y-4">
            <div>
              <label htmlFor="stateCode" className="field-label">Studio&rsquo;s GST state</label>
              <select id="stateCode" name="stateCode" defaultValue={b.stateCode} aria-describedby="state-help" className="field">
                {GST_STATES.map(([code, name]) => (
                  <option key={code} value={code}>{code} {name}</option>
                ))}
              </select>
              <p id="state-help" className="mt-2 text-xs text-muted">Clients in this state are charged CGST + SGST; others IGST.</p>
            </div>
            <div>
              <label htmlFor="bankDetails" className="field-label">Bank details for payment</label>
              <textarea id="bankDetails" name="bankDetails" rows={4} defaultValue={b.bankDetails ?? ""} placeholder={["Account name", "Bank and branch", "Account number", "IFSC", "UPI ID"].join("\n")} className="field h-auto py-2" />
            </div>
            <div>
              <label htmlFor="invoiceTerms" className="field-label">Invoice terms</label>
              <textarea id="invoiceTerms" name="invoiceTerms" rows={3} defaultValue={b.invoiceTerms ?? ""} className="field h-auto py-2" />
            </div>
          </ActionForm>
        </section>

        <section className="card p-5" aria-labelledby="preview-title">
          <h2 id="preview-title" className="card-title mb-4">How it prints</h2>
          <div className="rounded-md border border-border p-5">
            <p className="text-lg font-bold">{b.companyName}</p>
            {b.address ? <p className="whitespace-pre-line text-muted">{b.address}</p> : <p className="text-muted">No address yet</p>}
            <p className="mt-1 text-xs text-muted">
              {[b.gstin ? `GSTIN ${b.gstin}` : null, b.phone, b.email].filter(Boolean).join(" · ") || "No GSTIN, phone or email yet"}
            </p>
            <p className="mt-4 font-mono text-xs">PURCHASE ORDER PO-2026-001</p>
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}
