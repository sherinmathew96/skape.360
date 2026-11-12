"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { GST_STATES } from "@/lib/gst";
import { formatINR, lineAmounts, orderTotals } from "@/lib/money";

export type InvoiceLineDraft = { description: string; sac: string; quantity: string; unit: string; rate: string; gstRate: string };
type Row = InvoiceLineDraft & { key: number };

/**
 * Invoice lines with live totals and the GST split for the chosen place of
 * supply. Posted as repeated fields: description, sac, quantity, unit, rate, gstRate.
 */
export function InvoiceLines({
  initial,
  defaultSac,
  studioState,
  initialPlace,
}: {
  initial: InvoiceLineDraft[];
  defaultSac: string;
  studioState: string;
  /** GST state code the invoice starts with: the client's state, or the studio's */
  initialPlace: string;
}) {
  const blank = (): InvoiceLineDraft => ({ description: "", sac: defaultSac, quantity: "1", unit: "nos", rate: "", gstRate: "18" });
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial : [blank()]).map((l, key) => ({ ...l, key })));
  const [next, setNext] = useState(rows.length);
  const [place, setPlace] = useState(initialPlace);
  const update = (key: number, patch: Partial<InvoiceLineDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const totals = orderTotals(rows.map((r) => ({ quantity: r.quantity || 0, rate: r.rate || 0, gstRate: r.gstRate || 0 })));

  const inState = place === studioState;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="placeOfSupply" className="field-label">Place of supply</label>
        <select id="placeOfSupply" name="placeOfSupply" value={place} onChange={(e) => setPlace(e.target.value)} aria-describedby="pos-help" className="field">
          {GST_STATES.map(([code, name]) => (
            <option key={code} value={code}>{code} {name}</option>
          ))}
        </select>
        <p id="pos-help" className="mt-2 text-xs text-muted">
          {inState ? "Same state as the studio: CGST + SGST." : "Another state: IGST."} Usually where the project site is.
        </p>
      </div>
    <fieldset>
      <legend className="field-label">What you&rsquo;re billing for</legend>
      <ol className="space-y-3">
        {rows.map((r, i) => {
          const n = i + 1;
          const a = lineAmounts({ quantity: r.quantity || 0, rate: r.rate || 0, gstRate: r.gstRate || 0 });
          return (
            <li key={r.key} className="rounded-md bg-ground p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`idesc-${r.key}`} className="sr-only">Line {n} description</label>
                  <input
                    id={`idesc-${r.key}`}
                    name="description"
                    value={r.description}
                    onChange={(e) => update(r.key, { description: e.target.value })}
                    placeholder={n === 1 ? "e.g. Professional fee: schematic design stage" : `Line ${n}`}
                    autoComplete="off"
                    className="field"
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remove line ${n}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="btn btn-quiet h-10 w-10 flex-none p-0 text-muted"
                >
                  <X size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_0.7fr_0.7fr_1.3fr_0.7fr]">
                <div>
                  <label htmlFor={`isac-${r.key}`} className="mb-1 block text-xs text-muted">SAC</label>
                  <input id={`isac-${r.key}`} name="sac" inputMode="numeric" value={r.sac} onChange={(e) => update(r.key, { sac: e.target.value })} className="field font-mono" />
                </div>
                <div>
                  <label htmlFor={`iqty-${r.key}`} className="mb-1 block text-xs text-muted">Qty</label>
                  <input id={`iqty-${r.key}`} name="quantity" type="number" inputMode="decimal" min="0" step="any" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} className="field num text-right" />
                </div>
                <div>
                  <label htmlFor={`iunit-${r.key}`} className="mb-1 block text-xs text-muted">Unit</label>
                  <input id={`iunit-${r.key}`} name="unit" value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} autoComplete="off" className="field" />
                </div>
                <div>
                  <label htmlFor={`irate-${r.key}`} className="mb-1 block text-xs text-muted">Rate (₹, before GST)</label>
                  <input id={`irate-${r.key}`} name="rate" type="number" inputMode="decimal" min="0" step="0.01" value={r.rate} onChange={(e) => update(r.key, { rate: e.target.value })} className="field num text-right" />
                </div>
                <div>
                  <label htmlFor={`igst-${r.key}`} className="mb-1 block text-xs text-muted">GST %</label>
                  <input id={`igst-${r.key}`} name="gstRate" type="number" inputMode="decimal" min="0" max="28" step="any" value={r.gstRate} onChange={(e) => update(r.key, { gstRate: e.target.value })} className="field num text-right" />
                </div>
              </div>
              {a.amount > 0 ? (
                <p className="num mt-2 text-right text-xs text-muted">
                  {formatINR(a.amount)} + GST {formatINR(a.gst)} = <span className="text-text">{formatINR(a.total)}</span>
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => {
          setRows((rs) => [...rs, { ...blank(), key: next }]);
          setNext((k) => k + 1);
        }}
        className="btn btn-quiet mt-2 px-2"
      >
        <Plus size={16} strokeWidth={1.5} aria-hidden="true" /> Add line
      </button>
      <dl className="num mt-3 space-y-1 border-t border-rule pt-3 text-right">
        <div className="flex justify-end gap-6"><dt className="text-muted">Taxable value</dt><dd className="w-32">{formatINR(totals.amount)}</dd></div>
        {inState ? (
          <>
            <div className="flex justify-end gap-6"><dt className="text-muted">CGST</dt><dd className="w-32">{formatINR(Math.round(totals.gst / 2))}</dd></div>
            <div className="flex justify-end gap-6"><dt className="text-muted">SGST</dt><dd className="w-32">{formatINR(totals.gst - Math.round(totals.gst / 2))}</dd></div>
          </>
        ) : (
          <div className="flex justify-end gap-6"><dt className="text-muted">IGST</dt><dd className="w-32">{formatINR(totals.gst)}</dd></div>
        )}
        <div className="flex justify-end gap-6 text-base font-bold"><dt>Invoice total</dt><dd className="w-32">{formatINR(totals.total)}</dd></div>
      </dl>
    </fieldset>
    </div>
  );
}
