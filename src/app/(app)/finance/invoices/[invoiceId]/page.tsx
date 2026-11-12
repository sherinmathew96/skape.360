import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, Printer, Send } from "lucide-react";
import { cancelInvoice, issueInvoice, recordPayment } from "@/app/finance-actions";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PAYMENT_METHODS } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { formatDate, formatDue, today } from "@/lib/dates";
import { getInvoice, METHOD_LABEL } from "@/lib/finance";
import { splitGst, stateName } from "@/lib/gst";
import { formatINR, formatQty, lineAmounts, toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getBusinessSettings } from "@/lib/procurement";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "finance.view")) redirect("/");
  const inv = await getInvoice((await params).invoiceId);
  if (!inv || !(await visibleProject(user, inv.projectId))) notFound();
  const studio = await getBusinessSettings();
  const manage = can(user.role, "finance.manage");
  const t = today();
  const split = splitGst(inv.totals.gst, studio.stateCode, inv.placeOfSupply);
  const settled = inv.received + inv.tds;
  const late = inv.status === "issued" && inv.outstanding > 0 && inv.dueDate !== null && inv.dueDate < t;
  const pill =
    inv.status === "draft" ? ["", "Draft"] : inv.status === "cancelled" ? ["", "Cancelled"] : inv.outstanding === 0 ? ["pill-positive", "Paid"] : settled > 0 ? ["pill-warning", "Part paid"] : late ? ["pill-negative", "Overdue"] : ["pill-warning", "Awaiting payment"];

  return (
    <div className="mx-auto max-w-[1136px]">
      <p className="mb-2 truncate text-muted">
        <Link href="/finance" className="hover:text-text hover:underline">Finance</Link> /{" "}
        <Link href={`/projects/${inv.projectId}/finance`} className="hover:text-text hover:underline">{inv.projectName}</Link>
      </p>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-mono text-2xl font-bold leading-8">{inv.number ?? "Draft invoice"}</h1>
            <span className={`pill ${pill[0]}`}>{pill[1]}</span>
          </div>
          <p className="mt-1 text-muted">
            {inv.clientName} · {inv.projectName}
            {inv.issueDate ? ` · issued ${formatDate(inv.issueDate)}` : ""}
            {inv.status === "issued" && inv.dueDate ? (
              <span className={late ? "text-negative" : ""}> · due {late ? formatDue(inv.dueDate).toLowerCase() : formatDate(inv.dueDate)}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manage && inv.status === "draft" ? (
            <>
              <Link href={`/finance/invoices/${inv.id}/edit`} className="btn btn-secondary">
                <Pencil size={16} strokeWidth={1.5} aria-hidden="true" /> Edit
              </Link>
              <form action={issueInvoice}>
                <input type="hidden" name="invoiceId" value={inv.id} />
                <button type="submit" className="btn btn-primary">
                  <Send size={16} strokeWidth={1.5} aria-hidden="true" /> Issue invoice
                </button>
              </form>
            </>
          ) : null}
          <Link href={`/print/invoice/${inv.id}`} target="_blank" className="btn btn-secondary">
            <Printer size={16} strokeWidth={1.5} aria-hidden="true" /> {inv.status === "draft" ? "Preview" : "Print or save PDF"}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card overflow-x-auto" aria-labelledby="inv-lines-title">
          <h2 id="inv-lines-title" className="card-title px-5 pb-2 pt-4">Lines</h2>
          <table className="table min-w-[520px]">
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col">SAC</th>
                <th scope="col" className="num">Qty</th>
                <th scope="col" className="num">Taxable value</th>
                <th scope="col" className="num">GST</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((i) => {
                const a = lineAmounts(i);
                return (
                  <tr key={i.id}>
                    <td>{i.description}</td>
                    <td className="font-mono text-xs text-muted">{i.sac ?? "–"}</td>
                    <td className="num whitespace-nowrap">{formatQty(i.quantity)} <span className="text-muted">{i.unit}</span></td>
                    <td className="num whitespace-nowrap">{formatINR(a.amount)}</td>
                    <td className="num whitespace-nowrap text-muted">{Number(i.gstRate)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <dl className="num space-y-1 border-t border-border px-5 py-4 text-right">
            <div className="flex justify-end gap-6"><dt className="text-muted">Taxable value</dt><dd className="w-36">{formatINR(inv.totals.amount)}</dd></div>
            {split.igst ? (
              <div className="flex justify-end gap-6"><dt className="text-muted">IGST</dt><dd className="w-36">{formatINR(split.igst)}</dd></div>
            ) : (
              <>
                <div className="flex justify-end gap-6"><dt className="text-muted">CGST</dt><dd className="w-36">{formatINR(split.cgst)}</dd></div>
                <div className="flex justify-end gap-6"><dt className="text-muted">SGST</dt><dd className="w-36">{formatINR(split.sgst)}</dd></div>
              </>
            )}
            <div className="flex justify-end gap-6 text-base font-bold"><dt>Total</dt><dd className="w-36">{formatINR(inv.totals.total)}</dd></div>
          </dl>
          <p className="border-t border-rule px-5 py-3 text-xs text-muted">
            Place of supply {inv.placeOfSupply} {stateName(inv.placeOfSupply)}
            {inv.notes ? ` · ${inv.notes}` : ""}
          </p>
        </section>

        <div className="grid grid-cols-1 gap-3">
          {inv.status === "issued" ? (
            <section className="card" aria-labelledby="pay-title">
              <div className="px-5 pb-2 pt-4">
                <h2 id="pay-title" className="card-title">Payments</h2>
                <p className="num text-muted">
                  {formatINR(settled)} of {formatINR(inv.totals.total)} settled
                  {inv.outstanding > 0 ? <span className={late ? "text-negative" : "text-text"}>, {formatINR(inv.outstanding)} due</span> : null}
                </p>
              </div>
              {inv.payments.length > 0 ? (
                <ul>
                  {inv.payments.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3 border-t border-rule px-5 py-2.5 text-xs leading-5">
                      <span>
                        <span className="block text-sm">{formatDate(p.receivedOn)} · {METHOD_LABEL[p.method]}</span>
                        <span className="text-muted">{[p.reference, p.recordedByName].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="num text-right">
                        <span className="block text-sm">{formatINR(toPaise(p.amount))}</span>
                        {toPaise(p.tds) > 0 ? <span className="text-muted">+ TDS {formatINR(toPaise(p.tds))}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {manage && inv.outstanding > 0 ? (
                <div className="border-t border-border bg-ground/60 p-5">
                  <ActionForm action={recordPayment} submitLabel="Record payment" pendingLabel="Saving…" className="space-y-3">
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="p-amount" className="field-label">Amount received</label>
                        <input id="p-amount" name="amount" type="number" inputMode="decimal" min="0" step="0.01" required defaultValue={(inv.outstanding / 100).toFixed(2)} className="field num text-right" />
                      </div>
                      <div>
                        <label htmlFor="p-tds" className="field-label">TDS deducted</label>
                        <input id="p-tds" name="tds" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" className="field num text-right" />
                      </div>
                      <div>
                        <label htmlFor="p-date" className="field-label">Received on</label>
                        <input id="p-date" name="receivedOn" type="date" required defaultValue={t} max={t} className="field" />
                      </div>
                      <div>
                        <label htmlFor="p-method" className="field-label">How</label>
                        <select id="p-method" name="method" defaultValue="bank" className="field">
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="p-ref" className="field-label">Reference</label>
                      <input id="p-ref" name="reference" placeholder="UTR or cheque number" autoComplete="off" className="field" />
                    </div>
                  </ActionForm>
                </div>
              ) : null}
            </section>
          ) : null}

          {manage && (inv.status === "draft" || (inv.status === "issued" && inv.payments.length === 0)) ? (
            <section className="card p-5" aria-labelledby="cancel-inv-title">
              <h2 id="cancel-inv-title" className="card-title mb-1">{inv.status === "draft" ? "Delete draft" : "Cancel invoice"}</h2>
              <p className="mb-4 text-muted">
                {inv.status === "draft" ? "Drafts have no number, so nothing is lost." : `${inv.number} stays on record, marked cancelled, so your numbering has no gaps.`}
              </p>
              <form action={cancelInvoice}>
                <input type="hidden" name="invoiceId" value={inv.id} />
                <ConfirmButton message={inv.status === "draft" ? "Delete this draft invoice?" : `Cancel ${inv.number}? Tell the client if it was already sent.`}>
                  {inv.status === "draft" ? "Delete draft" : `Cancel ${inv.number}`}
                </ConfirmButton>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
