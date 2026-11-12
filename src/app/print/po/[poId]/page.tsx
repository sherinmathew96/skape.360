import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { getUser, requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { formatINR, formatQty, lineAmounts, orderTotals } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getBusinessSettings, getPurchaseOrder } from "@/lib/procurement";

type Props = { params: Promise<{ poId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // The order number becomes the PDF's file name; only shown to someone allowed to see it.
  const user = await getUser();
  const found = user && can(user.role, "procurement.prices") ? await getPurchaseOrder((await params).poId) : null;
  const ok = found && user && (await visibleProject(user, found.po.projectId));
  return { title: { absolute: ok ? found.po.number : "Purchase order" } };
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

/** A4 purchase order, laid out for printing or "Save as PDF" from the browser. */
export default async function PrintPoPage({ params }: Props) {
  const user = await requireUser();
  if (!can(user.role, "procurement.prices")) notFound();
  const found = await getPurchaseOrder((await params).poId);
  if (!found || !(await visibleProject(user, found.po.projectId))) notFound();
  const { po, items } = found;
  const b = await getBusinessSettings();
  const totals = orderTotals(items);
  const issued = po.issuedAt ? po.issuedAt.toISOString().slice(0, 10) : null;

  return (
    <div className="min-h-dvh bg-[#e9e8e5] py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { body { background: #fff; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[794px] justify-end gap-2 px-4 print:hidden">
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[794px] bg-white p-10 text-[13px] leading-5 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div>
            <p className="text-xl font-bold">{b.companyName}</p>
            {b.address ? <p className="whitespace-pre-line">{b.address}</p> : null}
            <p className="text-[12px]">{[b.gstin ? `GSTIN ${b.gstin}` : null, b.phone, b.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tracking-wide">PURCHASE ORDER</p>
            <p className="font-mono">{po.number}</p>
            <p>{issued ? fmtDate(issued) : "Draft, not issued"}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase text-[#555]">Supplier</p>
            <p className="font-bold">{po.supplierName}</p>
            {po.supplierContact ? <p>Attn: {po.supplierContact}</p> : null}
            {po.supplierAddress ? <p className="whitespace-pre-line">{po.supplierAddress}</p> : null}
            <p>{[po.supplierPhone, po.supplierEmail].filter(Boolean).join(" · ")}</p>
            {po.supplierGstin ? <p>GSTIN {po.supplierGstin}</p> : null}
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-[#555]">Deliver to</p>
            <p className="font-bold">{po.projectName} ({po.projectCode})</p>
            {po.deliveryAddress ? <p className="whitespace-pre-line">{po.deliveryAddress}</p> : null}
            {po.expectedDate ? <p className="mt-1">Required by <b>{fmtDate(po.expectedDate)}</b></p> : null}
          </div>
        </section>

        <table className="w-full border-collapse tabular-nums">
          <thead>
            <tr className="border-y border-black text-left text-[11px] uppercase">
              <th className="py-1.5 pr-2">#</th>
              <th className="py-1.5 pr-2">Description</th>
              <th className="py-1.5 pr-2 text-right">Qty</th>
              <th className="py-1.5 pr-2">Unit</th>
              <th className="py-1.5 pr-2 text-right">Rate</th>
              <th className="py-1.5 pr-2 text-right">Amount</th>
              <th className="py-1.5 pr-2 text-right">GST</th>
              <th className="py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => {
              const a = lineAmounts(i);
              return (
                <tr key={i.id} className="border-b border-[#ccc] align-top">
                  <td className="py-1.5 pr-2">{n + 1}</td>
                  <td className="py-1.5 pr-2">{i.description}</td>
                  <td className="py-1.5 pr-2 text-right">{formatQty(i.quantity)}</td>
                  <td className="py-1.5 pr-2">{i.unit}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-right">{formatINR(Math.round(Number(i.rate) * 100))}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-right">{formatINR(a.amount)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-right">{Number(i.gstRate)}% {formatINR(a.gst)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right">{formatINR(a.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-3 flex justify-end">
          <table className="tabular-nums">
            <tbody>
              <tr><td className="pr-6">Amount before GST</td><td className="text-right">{formatINR(totals.amount)}</td></tr>
              <tr><td className="pr-6">GST</td><td className="text-right">{formatINR(totals.gst)}</td></tr>
              <tr className="border-t border-black text-[15px] font-bold"><td className="pr-6 pt-1">Total</td><td className="pt-1 text-right">{formatINR(totals.total)}</td></tr>
            </tbody>
          </table>
        </div>

        {po.notes ? (
          <section className="mt-6">
            <p className="text-[11px] font-bold uppercase text-[#555]">Notes</p>
            <p className="whitespace-pre-line">{po.notes}</p>
          </section>
        ) : null}
        {b.poTerms ? (
          <section className="mt-4">
            <p className="text-[11px] font-bold uppercase text-[#555]">Terms</p>
            <p className="whitespace-pre-line text-[12px]">{b.poTerms}</p>
          </section>
        ) : null}

        <footer className="mt-12 flex justify-between gap-6 text-[12px]">
          <p>Please quote <b>{po.number}</b> on your delivery challan and invoice.</p>
          <div className="w-48 border-t border-black pt-1 text-center">For {b.companyName}</div>
        </footer>
      </article>
    </div>
  );
}
