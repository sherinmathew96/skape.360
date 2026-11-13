import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cancelBill, recordVendorPayment } from "@/app/finance-actions";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PAYMENT_METHODS } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { formatDate, formatDue, today } from "@/lib/dates";
import { getBill, METHOD_LABEL, orderValue } from "@/lib/finance";
import { formatINR, toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Supplier bill" };

export default async function BillPage({ params }: { params: Promise<{ billId: string }> }) {
  const user = await requireUser();
  if (!can(user, "finance.view")) redirect("/");
  const bill = await getBill((await params).billId);
  if (!bill || (bill.projectId && !(await visibleProject(user, bill.projectId)))) notFound();
  const manage = can(user, "finance.manage");
  const t = today();
  const late = !bill.cancelled && bill.balance > 0 && bill.dueDate !== null && bill.dueDate < t;
  const po = bill.poId ? await orderValue(bill.poId) : null;
  const pill = bill.cancelled ? ["", "Cancelled"] : bill.balance === 0 ? ["pill-positive", "Paid"] : bill.paidPaise > 0 ? ["pill-warning", "Part paid"] : late ? ["pill-negative", "Overdue"] : ["pill-warning", "To pay"];

  return (
    <div className="mx-auto max-w-[1136px]">
      <p className="mb-2 truncate text-muted">
        <Link href="/finance" className="hover:text-text hover:underline">Finance</Link> / Supplier bill
      </p>
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">{bill.supplierName}</h1>
          <span className={`pill ${pill[0]}`}>{pill[1]}</span>
        </div>
        <p className="mt-1 text-muted">
          Bill {bill.billNumber} · {formatDate(bill.billDate)}
          {bill.projectName ? ` · ${bill.projectName}` : " · studio overhead"}
          {bill.balance > 0 && bill.dueDate ? <span className={late ? "text-negative" : ""}> · pay {late ? formatDue(bill.dueDate).toLowerCase() : `by ${formatDate(bill.dueDate)}`}</span> : null}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card" aria-labelledby="bill-title">
          <h2 id="bill-title" className="card-title px-5 pb-2 pt-4">Amount</h2>
          <dl className="num space-y-1 px-5 pb-4 text-right">
            <div className="flex justify-end gap-6"><dt className="text-muted">Before GST</dt><dd className="w-36">{formatINR(toPaise(bill.amount))}</dd></div>
            <div className="flex justify-end gap-6"><dt className="text-muted">GST</dt><dd className="w-36">{formatINR(toPaise(bill.gst))}</dd></div>
            <div className="flex justify-end gap-6 text-base font-bold"><dt>Bill total</dt><dd className="w-36">{formatINR(bill.total)}</dd></div>
            <div className="flex justify-end gap-6"><dt className="text-muted">Paid</dt><dd className="w-36">{formatINR(bill.paidPaise)}</dd></div>
            <div className={`flex justify-end gap-6 ${bill.balance > 0 ? "font-medium" : ""}`}><dt className="text-muted">Still to pay</dt><dd className="w-36">{formatINR(bill.balance)}</dd></div>
          </dl>
          {po && bill.poNumber ? (
            <div className="border-t border-rule px-5 py-4">
              <h3 className="mb-2 font-medium">
                Against <Link href={`/purchasing/po/${bill.poId}`} className="font-mono underline">{bill.poNumber}</Link>
              </h3>
              <dl className="num grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-muted">Ordered</dt><dd className="text-sm">{formatINR(po.ordered)}</dd></div>
                <div><dt className="text-muted">Delivered</dt><dd className="text-sm">{formatINR(po.delivered)}</dd></div>
                <div><dt className="text-muted">Billed in total</dt><dd className={`text-sm ${po.billed > po.delivered + 100 ? "text-negative" : ""}`}>{formatINR(po.billed)}</dd></div>
              </dl>
              {po.billed > po.delivered + 100 ? (
                <p className="mt-2 text-xs text-negative">Billed {formatINR(po.billed - po.delivered)} more than has been delivered.</p>
              ) : null}
            </div>
          ) : null}
          {bill.note || bill.fileId ? (
            <p className="border-t border-rule px-5 py-3">
              {bill.note}
              {bill.fileId ? (
                <>
                  {bill.note ? " · " : ""}
                  <a href={`/api/files/${bill.fileId}`} target="_blank" rel="noreferrer" className="underline">View the bill</a>
                </>
              ) : null}
            </p>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-3">
          <section className="card" aria-labelledby="vpay-title">
            <h2 id="vpay-title" className="card-title px-5 pb-2 pt-4">Payments</h2>
            {bill.payments.length === 0 ? (
              <p className="empty mx-5 mb-4 mt-2">Nothing paid yet.</p>
            ) : (
              <ul>
                {bill.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 border-t border-rule px-5 py-2.5 text-xs leading-5 first:border-t-0">
                    <span>
                      <span className="block text-sm">{formatDate(p.paidOn)} · {METHOD_LABEL[p.method]}</span>
                      <span className="text-muted">{[p.reference, p.recordedByName].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="num text-sm">{formatINR(toPaise(p.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
            {manage && bill.balance > 0 ? (
              <div className="border-t border-border bg-ground/60 p-5">
                <ActionForm action={recordVendorPayment} submitLabel="Record payment" pendingLabel="Saving…" className="space-y-3">
                  <input type="hidden" name="billId" value={bill.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="vp-amount" className="field-label">Amount paid</label>
                      <input id="vp-amount" name="amount" type="number" inputMode="decimal" min="0" step="0.01" required defaultValue={(bill.balance / 100).toFixed(2)} className="field num text-right" />
                    </div>
                    <div>
                      <label htmlFor="vp-date" className="field-label">Paid on</label>
                      <input id="vp-date" name="paidOn" type="date" required defaultValue={t} max={t} className="field" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="vp-method" className="field-label">How</label>
                      <select id="vp-method" name="method" defaultValue="bank" className="field">
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="vp-ref" className="field-label">Reference</label>
                      <input id="vp-ref" name="reference" placeholder="UTR or cheque no." autoComplete="off" className="field" />
                    </div>
                  </div>
                </ActionForm>
              </div>
            ) : null}
          </section>

          {manage && !bill.cancelled && bill.payments.length === 0 ? (
            <section className="card p-5" aria-labelledby="cancel-bill-title">
              <h2 id="cancel-bill-title" className="card-title mb-1">Cancel bill</h2>
              <p className="mb-4 text-muted">For a bill entered by mistake, or replaced by a corrected one.</p>
              <form action={cancelBill}>
                <input type="hidden" name="billId" value={bill.id} />
                <ConfirmButton message={`Cancel bill ${bill.billNumber} from ${bill.supplierName}?`}>Cancel bill</ConfirmButton>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
