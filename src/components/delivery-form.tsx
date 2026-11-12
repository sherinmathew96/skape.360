"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Truck } from "lucide-react";
import { recordDelivery } from "@/app/procurement-actions";
import { PhotoPicker } from "./snag-forms";

type Item = { id: string; description: string; unit: string; remaining: number };

/** What arrived on site today, against the items still due on this order. */
export function DeliveryForm({ poId, projectId, items, today }: { poId: string; projectId: string; items: Item[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [receivedOn, setReceivedOn] = useState(today);
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, String(i.remaining)])));
  const [note, setNote] = useState("");
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
        <Truck size={16} strokeWidth={1.5} aria-hidden="true" /> Record a delivery
      </button>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await recordDelivery({
            poId,
            receivedOn,
            note,
            photoFileId,
            lines: items.map((i) => ({ poItemId: i.id, quantity: qty[i.id] ?? "" })),
          });
          setMessage(res);
          if (res.ok) {
            setOpen(false);
            router.refresh();
          }
        });
      }}
    >
      <div>
        <label htmlFor="del-date" className="field-label">Delivered on</label>
        <input id="del-date" type="date" required max={today} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className="field" />
      </div>
      <fieldset>
        <legend className="field-label">Quantity received</legend>
        <p className="mb-2 text-xs text-muted">Change the numbers if less arrived. Leave 0 for items that didn&rsquo;t come.</p>
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3">
              <label htmlFor={`del-${i.id}`} className="min-w-0 flex-1">
                <span className="block truncate">{i.description}</span>
                <span className="num block text-xs text-muted">{i.remaining} {i.unit} still due</span>
              </label>
              <input
                id={`del-${i.id}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={i.remaining}
                step="any"
                value={qty[i.id]}
                onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))}
                className="field num w-24 flex-none text-right"
              />
              <span className="w-12 flex-none text-xs text-muted">{i.unit}</span>
            </li>
          ))}
        </ul>
      </fieldset>
      <div>
        <label htmlFor="del-note" className="field-label">Challan number or note</label>
        <input id="del-note" value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" className="field" />
      </div>
      <div>
        <span className="field-label">Photo of the delivery challan</span>
        <PhotoPicker projectId={projectId} fileId={photoFileId} onChange={setPhotoFileId} label="Take or add a photo" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Saving…" : "Save delivery"}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">Cancel</button>
        <p aria-live="polite" className={message?.error ? "text-negative" : "text-muted"}>{message?.error ?? ""}</p>
      </div>
    </form>
  );
}
