import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { getUser, requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { getInvoice } from "@/lib/finance";
import { rupeesInWords, splitGst, stateName } from "@/lib/gst";
import { formatINR, formatQty, lineAmounts } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getBusinessSettings } from "@/lib/procurement";

type Props = { params: Promise<{ invoiceId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // The invoice number becomes the PDF's file name; only for someone allowed to see it.
  const user = await getUser();
  const inv = user && can(user, "finance.view") ? await getInvoice((await params).invoiceId) : null;
  const ok = inv && user && (await visibleProject(user, inv.projectId));
  return { title: { absolute: ok && inv.number ? inv.number.replaceAll("/", "-") : "Invoice" } };
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

/** A4 tax invoice in the usual Indian layout: CGST + SGST or IGST, amount in words, bank details. */
export default async function PrintInvoicePage({ params }: Props) {
  const user = await requireUser();
  if (!can(user, "finance.view")) notFound();
  const inv = await getInvoice((await params).invoiceId);
  if (!inv || !(await visibleProject(user, inv.projectId))) notFound();
  const b = await getBusinessSettings();
  const inState = b.stateCode === inv.placeOfSupply;
  const split = splitGst(inv.totals.gst, b.stateCode, inv.placeOfSupply);

  return (
    <div className="min-h-dvh bg-[#e9e8e5] py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { body { background: #fff; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[794px] justify-end gap-2 px-4 print:hidden">
        <PrintButton />
      </div>
      <article className="relative mx-auto max-w-[794px] bg-white p-10 text-[13px] leading-5 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {inv.status !== "issued" ? (
          <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-6xl font-bold text-black/10" aria-hidden="true">
            {inv.status === "draft" ? "DRAFT" : "CANCELLED"}
          </p>
        ) : null}
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div>
            <p className="text-xl font-bold">{b.companyName}</p>
            {b.address ? <p className="whitespace-pre-line">{b.address}</p> : null}
            <p className="text-[12px]">
              {[b.gstin ? `GSTIN ${b.gstin}` : null, `State ${b.stateCode} ${stateName(b.stateCode)}`, b.phone, b.email].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tracking-wide">TAX INVOICE</p>
            <p className="font-mono">{inv.number ?? "Draft"}</p>
            {inv.issueDate ? <p>{fmtDate(inv.issueDate)}</p> : null}
            {inv.dueDate && inv.status === "issued" ? <p className="text-[12px]">Due {fmtDate(inv.dueDate)}</p> : null}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase text-[#555]">Bill to</p>
            <p className="font-bold">{inv.clientName}</p>
            {inv.clientAddress ? <p className="whitespace-pre-line">{inv.clientAddress}</p> : null}
            {inv.clientGstin ? <p>GSTIN {inv.clientGstin}</p> : null}
            <p>{[inv.clientPhone, inv.clientEmail].filter(Boolean).join(" · ")}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-[#555]">Project</p>
            <p className="font-bold">{inv.projectName} ({inv.projectCode})</p>
            {inv.projectLocation ? <p>{inv.projectLocation}</p> : null}
            {inv.milestoneName ? <p>Milestone: {inv.milestoneName}</p> : null}
            <p className="mt-1">Place of supply: {inv.placeOfSupply} {stateName(inv.placeOfSupply)}</p>
          </div>
        </section>

        <table className="w-full border-collapse tabular-nums">
          <thead>
            <tr className="border-y border-black text-left text-[11px] uppercase">
              <th className="py-1.5 pr-2">#</th>
              <th className="py-1.5 pr-2">Description</th>
              <th className="py-1.5 pr-2">SAC</th>
              <th className="py-1.5 pr-2 text-right">Qty</th>
              <th className="py-1.5 pr-2 text-right">Rate</th>
              <th className="py-1.5 pr-2 text-right">Taxable</th>
              <th className="py-1.5 pr-2 text-right">GST</th>
              <th className="py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((i, n) => {
              const a = lineAmounts(i);
              return (
                <tr key={i.id} className="border-b border-[#ccc] align-top">
                  <td className="py-1.5 pr-2">{n + 1}</td>
                  <td className="py-1.5 pr-2">{i.description}</td>
                  <td className="py-1.5 pr-2 font-mono text-[12px]">{i.sac ?? ""}</td>
                  <td className="py-1.5 pr-2 text-right">{formatQty(i.quantity)} {i.unit !== "nos" ? i.unit : ""}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-right">{formatINR(Math.round(Number(i.rate) * 100))}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-right">{formatINR(a.amount)}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-right">{Number(i.gstRate)}%</td>
                  <td className="whitespace-nowrap py-1.5 text-right">{formatINR(a.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-3 flex justify-between gap-6">
          <p className="max-w-[55%] text-[12px]">
            <span className="text-[11px] font-bold uppercase text-[#555]">Amount in words</span>
            <br />
            {rupeesInWords(inv.totals.total)}
          </p>
          <table className="tabular-nums">
            <tbody>
              <tr><td className="pr-6">Taxable value</td><td className="text-right">{formatINR(inv.totals.amount)}</td></tr>
              {inState ? (
                <>
                  <tr><td className="pr-6">CGST</td><td className="text-right">{formatINR(split.cgst)}</td></tr>
                  <tr><td className="pr-6">SGST</td><td className="text-right">{formatINR(split.sgst)}</td></tr>
                </>
              ) : (
                <tr><td className="pr-6">IGST</td><td className="text-right">{formatINR(split.igst)}</td></tr>
              )}
              <tr className="border-t border-black text-[15px] font-bold"><td className="pr-6 pt-1">Total</td><td className="pt-1 text-right">{formatINR(inv.totals.total)}</td></tr>
            </tbody>
          </table>
        </div>

        {b.bankDetails ? (
          <section className="mt-6">
            <p className="text-[11px] font-bold uppercase text-[#555]">Pay to</p>
            <p className="whitespace-pre-line">{b.bankDetails}</p>
          </section>
        ) : null}
        {inv.notes ? (
          <section className="mt-4">
            <p className="text-[11px] font-bold uppercase text-[#555]">Notes</p>
            <p className="whitespace-pre-line">{inv.notes}</p>
          </section>
        ) : null}
        {b.invoiceTerms ? (
          <section className="mt-4">
            <p className="text-[11px] font-bold uppercase text-[#555]">Terms</p>
            <p className="whitespace-pre-line text-[12px]">{b.invoiceTerms}</p>
          </section>
        ) : null}

        <footer className="mt-12 flex justify-between gap-6 text-[12px]">
          <p>Please quote <b>{inv.number ?? "the invoice number"}</b> with your payment.</p>
          <div className="w-48 border-t border-black pt-1 text-center">For {b.companyName}</div>
        </footer>
      </article>
    </div>
  );
}
