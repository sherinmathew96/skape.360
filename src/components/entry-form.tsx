"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { addIncome } from "@/app/daybook-actions";
import { addExpense } from "@/app/finance-actions";
import { PhotoPicker } from "./snag-forms";

const OUT: [string, string][] = [
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
const IN: [string, string][] = [
  ["client_payment", "Client payment"],
  ["advance", "Advance"],
  ["refund", "Refund"],
  ["scrap_sale", "Scrap or material sold"],
  ["fees", "Fees"],
  ["interest", "Interest"],
  ["other", "Other income"],
];
const METHODS: [string, string][] = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["bank", "Bank transfer"],
  ["card", "Card"],
  ["cheque", "Cheque"],
];

/** One line in the day book: money in or money out, with an optional photo of the bill or receipt. */
export function EntryForm({ projectId, today, office }: { projectId: string | null; today: string; office: boolean }) {
  const router = useRouter();
  const [dir, setDir] = useState<"out" | "in">("out");
  const [category, setCategory] = useState(office ? "office" : "site_petty_cash");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("cash");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const categories = dir === "in" ? IN : OUT;

  const pick = (next: "in" | "out") => {
    setDir(next);
    setCategory(next === "in" ? (office ? "fees" : "advance") : office ? "office" : "site_petty_cash");
    setMessage(null);
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res =
            dir === "in"
              ? await addIncome({ projectId: projectId ?? "", category, receivedOn: date, amount, description, method, receiptFileId: receipt })
              : await addExpense({ projectId: projectId ?? "", category, spentOn: date, amount, description, method, receiptFileId: receipt });
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
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-raised p-1" role="radiogroup" aria-label="Money in or out">
        {(
          [
            ["out", "Money out", ArrowUpRight, "text-negative"],
            ["in", "Money in", ArrowDownLeft, "text-positive"],
          ] as const
        ).map(([key, label, Icon, tone]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={dir === key}
            onClick={() => pick(key)}
            className={`flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors ${dir === key ? "bg-surface shadow-sm" : "text-muted hover:text-text"}`}
          >
            <Icon size={18} strokeWidth={2} aria-hidden="true" className={dir === key ? tone : ""} />
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="e-amount" className="field-label">Amount (₹)</label>
          <input id="e-amount" type="number" inputMode="decimal" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="field num text-right" />
        </div>
        <div>
          <label htmlFor="e-date" className="field-label">Date</label>
          <input id="e-date" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="e-desc" className="field-label">{dir === "in" ? "From whom, and for what" : "What for"}</label>
        <input
          id="e-desc"
          required
          minLength={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={dir === "in" ? "e.g. Advance from client for tiles" : "e.g. Unloading 50 cement bags"}
          autoComplete="off"
          className="field"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="e-cat" className="field-label">Category</label>
          <select id="e-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="field">
            {categories.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="e-method" className="field-label">{dir === "in" ? "Received by" : "Paid by"}</label>
          <select id="e-method" value={method} onChange={(e) => setMethod(e.target.value)} className="field">
            {METHODS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <span className="field-label">{dir === "in" ? "Receipt or proof (optional)" : "Bill or receipt (optional)"}</span>
        <PhotoPicker key={resetKey} projectId={projectId} kind="receipt" fileId={receipt} onChange={setReceipt} label="Take or add a photo" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Saving…" : dir === "in" ? "Save money in" : "Save money out"}
        </button>
        <p aria-live="polite" className={message?.error ? "text-negative" : "text-muted"}>{message?.error ?? message?.ok ?? ""}</p>
      </div>
    </form>
  );
}
