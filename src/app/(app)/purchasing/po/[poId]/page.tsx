import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Printer, Send } from "lucide-react";
import { cancelPurchaseOrder, issuePurchaseOrder } from "@/app/procurement-actions";
import { ConfirmButton } from "@/components/confirm-button";
import { DeliveryForm } from "@/components/delivery-form";
import { requireUser } from "@/lib/auth";
import { isProjectMember, visibleProject } from "@/lib/data";
import { formatDate, formatDue, today } from "@/lib/dates";
import { formatINR, formatQty, lineAmounts, orderTotals } from "@/lib/money";
import { can } from "@/lib/permissions";
import { canSeeOrders, getPurchaseOrder, PO_LABEL, PO_PILL } from "@/lib/procurement";

export const metadata: Metadata = { title: "Purchase order" };

export default async function PoPage({ params }: { params: Promise<{ poId: string }> }) {
  const user = await requireUser();
  const found = await getPurchaseOrder((await params).poId);
  if (!found || !canSeeOrders(user) || !(await visibleProject(user, found.po.projectId))) notFound();
  const { po, items, receipts } = found;

  const buyer = can(user, "procurement.manage");
  const prices = can(user, "procurement.prices");
  const onSite = can(user, "site.report") && (await isProjectMember(user.id, po.projectId));
  const open = po.status === "issued" || po.status === "partly_received";
  const totals = orderTotals(items);
  const t = today();
  const due = items
    .map((i) => ({ id: i.id, description: i.description, unit: i.unit, remaining: Math.max(0, Number(i.quantity) - Number(i.received)) }))
    .filter((i) => i.remaining > 0);

  return (
    <div className="mx-auto max-w-[1136px]">
      <p className="mb-2 truncate text-muted">
        {buyer || prices ? (
          <>
            <Link href="/purchasing" className="hover:text-text hover:underline">Purchasing</Link> /{" "}
          </>
        ) : null}
        <Link href={`/projects/${po.projectId}/materials`} className="hover:text-text hover:underline">{po.projectName}</Link>
      </p>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-mono text-2xl font-bold leading-8">{po.number}</h1>
            <span className={`pill ${PO_PILL[po.status]}`}>{PO_LABEL[po.status]}</span>
          </div>
          <p className="mt-1 text-muted">
            {po.supplierName} · {po.projectName}
            {po.expectedDate ? ` · deliver by ${formatDate(po.expectedDate)}` : ""}
            {open && po.expectedDate && po.expectedDate < t ? <span className="text-negative"> ({formatDue(po.expectedDate).toLowerCase()})</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {buyer && po.status === "draft" ? (
            <>
              <Link href={`/purchasing/po/${po.id}/edit`} className="btn btn-secondary">
                <Pencil size={16} strokeWidth={1.5} aria-hidden="true" /> Edit
              </Link>
              <form action={issuePurchaseOrder}>
                <input type="hidden" name="poId" value={po.id} />
                <button type="submit" className="btn btn-primary">
                  <Send size={16} strokeWidth={1.5} aria-hidden="true" /> Issue order
                </button>
              </form>
            </>
          ) : null}
          {prices && po.status !== "draft" ? (
            <Link href={`/print/po/${po.id}`} target="_blank" className="btn btn-secondary">
              <Printer size={16} strokeWidth={1.5} aria-hidden="true" /> Print or save PDF
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card overflow-x-auto" aria-labelledby="po-items-title">
          <h2 id="po-items-title" className="card-title px-5 pb-2 pt-4">Items</h2>
          <table className={`table ${prices ? "min-w-[560px]" : ""}`}>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="num">Ordered</th>
                <th scope="col" className="num">Received</th>
                {prices ? (
                  <>
                    <th scope="col" className="num">Rate</th>
                    <th scope="col" className="num">GST</th>
                    <th scope="col" className="num">Amount</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const a = lineAmounts(i);
                const full = Number(i.received) >= Number(i.quantity);
                return (
                  <tr key={i.id}>
                    <td>{i.description}</td>
                    <td className="num whitespace-nowrap">{formatQty(i.quantity)} <span className="text-muted">{i.unit}</span></td>
                    <td className={`num whitespace-nowrap ${full ? "text-positive" : Number(i.received) > 0 ? "" : "text-muted"}`}>
                      {formatQty(i.received)}
                    </td>
                    {prices ? (
                      <>
                        <td className="num whitespace-nowrap">{formatINR(Math.round(Number(i.rate) * 100))}</td>
                        <td className="num whitespace-nowrap text-muted">{Number(i.gstRate)}%</td>
                        <td className="num whitespace-nowrap">{formatINR(a.total)}</td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            {prices ? (
              <tfoot>
                <tr>
                  <td colSpan={5} className="num border-t border-border text-muted">Before GST {formatINR(totals.amount)} · GST {formatINR(totals.gst)}</td>
                  <td className="num whitespace-nowrap border-t border-border font-bold">{formatINR(totals.total)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
          {po.notes || po.deliveryAddress ? (
            <dl className="grid grid-cols-1 gap-3 border-t border-rule px-5 py-4 sm:grid-cols-2">
              {po.deliveryAddress ? (
                <div>
                  <dt className="text-xs text-muted">Deliver to</dt>
                  <dd>{po.deliveryAddress}</dd>
                </div>
              ) : null}
              {po.notes ? (
                <div>
                  <dt className="text-xs text-muted">Notes</dt>
                  <dd className="whitespace-pre-line">{po.notes}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-3">
          {open && (onSite || buyer) && due.length > 0 ? (
            <section className="card p-5" aria-label="Record a delivery">
              {/* Keyed on what is still due, so the form starts fresh after each delivery. */}
              <DeliveryForm key={due.map((d) => `${d.id}:${d.remaining}`).join("|")} poId={po.id} projectId={po.projectId} items={due} today={t} />
            </section>
          ) : null}

          <section className="card" aria-labelledby="deliveries-title">
            <h2 id="deliveries-title" className="card-title px-5 pb-2 pt-4">Deliveries</h2>
            {receipts.length === 0 ? (
              <p className="empty mx-5 mb-5 mt-2">{po.status === "draft" ? "Issue the order before recording deliveries." : "Nothing delivered yet."}</p>
            ) : (
              <ul>
                {receipts.map((r) => (
                  <li key={r.id} className="flex gap-3 border-t border-rule px-5 py-3 first:border-t-0">
                    {r.photoFileId ? (
                      <a href={`/api/files/${r.photoFileId}`} target="_blank" rel="noreferrer" className="flex-none">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/files/${r.photoFileId}`} alt={`Challan photo, ${formatDate(r.receivedOn)}`} width={64} height={48} loading="lazy" className="h-12 w-16 rounded-[4px] bg-raised object-cover" />
                      </a>
                    ) : null}
                    <div className="min-w-0 text-xs leading-5">
                      <p className="text-sm font-medium">{formatDate(r.receivedOn)}{r.receivedByName ? <span className="font-normal text-muted"> · {r.receivedByName}</span> : null}</p>
                      <p className="text-muted">
                        {r.lines
                          .map((l) => {
                            const item = items.find((i) => i.id === l.poItemId);
                            return item ? `${item.description} ${formatQty(l.quantity)} ${item.unit}` : null;
                          })
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      {r.note ? <p>{r.note}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {buyer && receipts.length === 0 && (po.status === "draft" || po.status === "issued") ? (
            <section className="card p-5" aria-labelledby="cancel-title">
              <h2 id="cancel-title" className="card-title mb-1">Cancel order</h2>
              <p className="mb-4 text-muted">
                {po.requestId ? "The material request goes back to approved, ready for a new order." : "Keeps it on record, marked cancelled."}
              </p>
              <form action={cancelPurchaseOrder}>
                <input type="hidden" name="poId" value={po.id} />
                <ConfirmButton message={`Cancel ${po.number}? Tell ${po.supplierName} if it was already sent.`}>Cancel {po.number}</ConfirmButton>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
