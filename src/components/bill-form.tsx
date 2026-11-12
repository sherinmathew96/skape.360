"use client";

import { useEffect, useState, useTransition } from "react";
import { checkOrderForBill, saveBill } from "@/app/finance-actions";
import { formatINR } from "@/lib/money";
import { PhotoPicker } from "./snag-forms";

type Order = { id: string; number: string; supplierId: string; projectId: string; projectName: string };

/**
 * Enter a supplier's bill. Picking the purchase order fills in the supplier
 * and project, and shows what was ordered, delivered and already billed, so a
 * bill for more than arrived on site stands out before it is saved.
 */
export function BillForm({
  suppliers,
  orders,
  projects,
  initialPoId,
  today,
}: {
  suppliers: { id: string; name: string }[];
  orders: Order[];
  projects: { id: string; name: string }[];
  initialPoId?: string;
  today: string;
}) {
  const start = orders.find((o) => o.id === initialPoId);
  const [poId, setPoId] = useState(start?.id ?? "");
  const [supplierId, setSupplierId] = useState(start?.supplierId ?? "");
  const [projectId, setProjectId] = useState(start?.projectId ?? "");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("");
  const [note, setNote] = useState("");
  const [fileId, setFileId] = useState<string | null>(null);
  const [value, setValue] = useState<{ ordered: number; delivered: number; billed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    if (poId) checkOrderForBill(poId).then((v) => alive && setValue(v));
    return () => {
      alive = false;
    };
  }, [poId]);

  const supplierOrders = orders.filter((o) => !supplierId || o.supplierId === supplierId);
  const billTotal = Math.round((Number(amount) || 0) * 100) + Math.round((Number(gst) || 0) * 100);
  const room = value && poId ? value.delivered - value.billed : null;
  const tooMuch = room !== null && billTotal > room + 100;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await saveBill({ supplierId, projectId, poId, billNumber, billDate, dueDate, amount, gst, note, fileId });
          if (res?.error) setError(res.error);
        });
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="b-supplier" className="field-label">Supplier</label>
          <select
            id="b-supplier"
            required
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              if (orders.find((o) => o.id === poId)?.supplierId !== e.target.value) {
                setPoId("");
                setValue(null);
              }
            }}
            className="field"
          >
            <option value="" disabled>Choose a supplier</option>
            {suppliers.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="b-po" className="field-label">Against purchase order</label>
          <select
            id="b-po"
            value={poId}
            onChange={(e) => {
              const o = orders.find((x) => x.id === e.target.value);
              setPoId(e.target.value);
              if (!e.target.value) setValue(null);
              if (o) {
                setSupplierId(o.supplierId);
                setProjectId(o.projectId);
              }
            }}
            className="field"
          >
            <option value="">No order</option>
            {supplierOrders.map((o) => (
              <option key={o.id} value={o.id}>{o.number} · {o.projectName}</option>
            ))}
          </select>
        </div>
      </div>

      {!poId ? (
        <div>
          <label htmlFor="b-project" className="field-label">Project</label>
          <select id="b-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="field">
            <option value="">Studio overhead (no project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      ) : value ? (
        <dl className="num grid grid-cols-3 gap-2 rounded-md bg-ground p-3 text-xs">
          <div><dt className="text-muted">Ordered</dt><dd className="text-sm">{formatINR(value.ordered)}</dd></div>
          <div><dt className="text-muted">Delivered</dt><dd className="text-sm">{formatINR(value.delivered)}</dd></div>
          <div><dt className="text-muted">Already billed</dt><dd className="text-sm">{formatINR(value.billed)}</dd></div>
        </dl>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="b-number" className="field-label">Supplier&rsquo;s bill no.</label>
          <input id="b-number" required value={billNumber} onChange={(e) => setBillNumber(e.target.value)} autoComplete="off" className="field" />
        </div>
        <div>
          <label htmlFor="b-date" className="field-label">Bill date</label>
          <input id="b-date" type="date" required max={today} value={billDate} onChange={(e) => setBillDate(e.target.value)} className="field" />
        </div>
        <div>
          <label htmlFor="b-due" className="field-label">Pay by</label>
          <input id="b-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="field" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="b-amount" className="field-label">Amount before GST (₹)</label>
          <input id="b-amount" type="number" inputMode="decimal" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="field num text-right" />
        </div>
        <div>
          <label htmlFor="b-gst" className="field-label">GST on the bill (₹)</label>
          <div className="flex gap-2">
            <input id="b-gst" type="number" inputMode="decimal" min="0" step="0.01" value={gst} onChange={(e) => setGst(e.target.value)} className="field num min-w-0 flex-1 text-right" />
            <button
              type="button"
              className="btn btn-secondary h-10 flex-none px-2.5 text-xs md:h-9"
              onClick={() => setGst(((Number(amount) || 0) * 0.18).toFixed(2))}
            >
              18%
            </button>
          </div>
        </div>
      </div>
      <p className="num text-right">
        Bill total <b>{formatINR(billTotal)}</b>
      </p>
      {tooMuch ? (
        <p role="alert" className="rounded-md bg-[#fffbeb] px-3 py-2 text-[#92400e]">
          This is {formatINR(billTotal - Math.max(0, room ?? 0))} more than what has been delivered and not yet billed. Check the bill before saving.
        </p>
      ) : null}

      <div>
        <label htmlFor="b-note" className="field-label">Note</label>
        <input id="b-note" value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" className="field" />
      </div>
      <div>
        <span className="field-label">Copy of the bill</span>
        <PhotoPicker key={projectId || "studio"} projectId={projectId || null} kind="receipt" fileId={fileId} onChange={setFileId} label="Add a photo or PDF" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Saving…" : "Save bill"}</button>
        {error ? <p role="alert" className="text-negative">{error}</p> : null}
      </div>
    </form>
  );
}
