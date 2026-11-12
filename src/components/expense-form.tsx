"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addExpense } from "@/app/finance-actions";
import { PhotoPicker } from "./snag-forms";

const CATEGORIES: [string, string][] = [
  ["site_petty_cash", "Site petty cash"],
  ["labour_wages", "Labour wages"],
  ["transport", "Transport and loading"],
  ["travel", "Travel"],
  ["printing", "Printing"],
  ["consultants", "Consultants"],
  ["rent", "Rent"],
  ["utilities", "Electricity, internet, phone"],
  ["software", "Software"],
  ["office", "Office supplies"],
  ["other", "Other"],
];
const METHODS: [string, string][] = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["bank", "Bank transfer"],
  ["card", "Card"],
  ["cheque", "Cheque"],
];

/**
 * Record money spent outside a purchase order, with a photo of the receipt.
 * With `projectId` the project is fixed (a site engineer's petty cash);
 * otherwise a project is chosen, or none for a studio overhead.
 */
export function ExpenseForm({
  projectId,
  projects,
  allowOverhead,
  today,
  defaultCategory = "site_petty_cash",
}: {
  projectId?: string;
  projects?: { id: string; name: string }[];
  allowOverhead: boolean;
  today: string;
  defaultCategory?: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState(projectId ?? (allowOverhead ? "" : (projects?.[0]?.id ?? "")));
  const [category, setCategory] = useState(defaultCategory);
  const [spentOn, setSpentOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("cash");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addExpense({ projectId: project, category, spentOn, amount, description, method, receiptFileId: receipt });
          setMessage(res);
          if (res.ok) {
            setAmount("");
            setDescription("");
            setReceipt(null);
            setResetKey((k) => k + 1);
            router.refresh();
          }
        });
      }}
    >
      {!projectId ? (
        <div>
          <label htmlFor="x-project" className="field-label">Project</label>
          <select
            id="x-project"
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              setReceipt(null);
              setResetKey((k) => k + 1);
            }}
            className="field"
          >
            {allowOverhead ? <option value="">Studio overhead (no project)</option> : null}
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="x-amount" className="field-label">Amount (₹)</label>
          <input id="x-amount" type="number" inputMode="decimal" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="field num text-right" />
        </div>
        <div>
          <label htmlFor="x-date" className="field-label">Spent on</label>
          <input id="x-date" type="date" required max={today} value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="x-desc" className="field-label">What for</label>
        <input id="x-desc" required minLength={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Unloading 50 cement bags" autoComplete="off" className="field" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="x-cat" className="field-label">Category</label>
          <select id="x-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="field">
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="x-method" className="field-label">Paid by</label>
          <select id="x-method" value={method} onChange={(e) => setMethod(e.target.value)} className="field">
            {METHODS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <span className="field-label">Receipt</span>
        <PhotoPicker key={`${project}-${resetKey}`} projectId={project || null} kind="receipt" fileId={receipt} onChange={setReceipt} label="Take or add a photo" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Saving…" : "Save expense"}</button>
        <p aria-live="polite" className={message?.error ? "text-negative" : "text-muted"}>{message?.error ?? message?.ok ?? ""}</p>
      </div>
    </form>
  );
}
