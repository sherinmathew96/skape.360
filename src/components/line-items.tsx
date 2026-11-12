"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { formatINR, lineAmounts, orderTotals, UNITS } from "@/lib/money";

export type LineDraft = { description: string; quantity: string; unit: string; rate?: string; gstRate?: string };
type Row = LineDraft & { key: number };

/**
 * Editable item lines. Without `priced`: description, quantity, unit (a
 * material request). With `priced`: also rate and GST, and live totals (a PO).
 * Fields are posted as repeated names: description, quantity, unit, rate, gstRate.
 */
export function LineItems({ initial, priced = false }: { initial: LineDraft[]; priced?: boolean }) {
  const blank = (): LineDraft => ({ description: "", quantity: "", unit: "bags", rate: "", gstRate: "18" });
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial : [blank()]).map((l, key) => ({ ...blank(), ...l, key })));
  const [next, setNext] = useState(rows.length);
  const update = (key: number, patch: Partial<LineDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const totals = priced ? orderTotals(rows.map((r) => ({ quantity: r.quantity || 0, rate: r.rate || 0, gstRate: r.gstRate || 0 }))) : null;

  return (
    <fieldset>
      <legend className="field-label">Items</legend>
      <datalist id="units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <ol className="space-y-3">
        {rows.map((r, i) => {
          const n = i + 1;
          const amount = priced ? lineAmounts({ quantity: r.quantity || 0, rate: r.rate || 0, gstRate: r.gstRate || 0 }) : null;
          return (
            <li key={r.key} className="rounded-md bg-ground p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`desc-${r.key}`} className="sr-only">Item {n} description</label>
                  <input
                    id={`desc-${r.key}`}
                    name="description"
                    value={r.description}
                    onChange={(e) => update(r.key, { description: e.target.value })}
                    placeholder={`Item ${n}, e.g. OPC 53 grade cement`}
                    autoComplete="off"
                    className="field"
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remove item ${n}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="btn btn-quiet h-10 w-10 flex-none p-0 text-muted"
                >
                  <X size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
              <div className={`mt-2 grid gap-2 ${priced ? "grid-cols-2 sm:grid-cols-[1fr_1fr_1.2fr_0.8fr]" : "grid-cols-2"}`}>
                <div>
                  <label htmlFor={`qty-${r.key}`} className="mb-1 block text-xs text-muted">Quantity</label>
                  <input id={`qty-${r.key}`} name="quantity" type="number" inputMode="decimal" min="0" step="any" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} className="field num text-right" />
                </div>
                <div>
                  <label htmlFor={`unit-${r.key}`} className="mb-1 block text-xs text-muted">Unit</label>
                  <input id={`unit-${r.key}`} name="unit" list="units" value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} autoComplete="off" className="field" />
                </div>
                {priced ? (
                  <>
                    <div>
                      <label htmlFor={`rate-${r.key}`} className="mb-1 block text-xs text-muted">Rate (₹ per unit)</label>
                      <input id={`rate-${r.key}`} name="rate" type="number" inputMode="decimal" min="0" step="0.01" value={r.rate} onChange={(e) => update(r.key, { rate: e.target.value })} className="field num text-right" />
                    </div>
                    <div>
                      <label htmlFor={`gst-${r.key}`} className="mb-1 block text-xs text-muted">GST %</label>
                      <input id={`gst-${r.key}`} name="gstRate" type="number" inputMode="decimal" min="0" max="28" step="any" value={r.gstRate} onChange={(e) => update(r.key, { gstRate: e.target.value })} className="field num text-right" />
                    </div>
                  </>
                ) : null}
              </div>
              {amount && amount.amount > 0 ? (
                <p className="num mt-2 text-right text-xs text-muted">
                  {formatINR(amount.amount)} + GST {formatINR(amount.gst)} = <span className="text-text">{formatINR(amount.total)}</span>
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
        <Plus size={16} strokeWidth={1.5} aria-hidden="true" /> Add item
      </button>
      {totals ? (
        <dl className="num mt-3 space-y-1 border-t border-rule pt-3 text-right">
          <div className="flex justify-end gap-6"><dt className="text-muted">Before GST</dt><dd className="w-32">{formatINR(totals.amount)}</dd></div>
          <div className="flex justify-end gap-6"><dt className="text-muted">GST</dt><dd className="w-32">{formatINR(totals.gst)}</dd></div>
          <div className="flex justify-end gap-6 text-base font-bold"><dt>Total</dt><dd className="w-32">{formatINR(totals.total)}</dd></div>
        </dl>
      ) : null}
    </fieldset>
  );
}
