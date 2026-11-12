"use client";

import { useId, useState } from "react";
import { Check, Copy } from "lucide-react";

/** A read-only value with a Copy button joined to it. */
export function CopyField({ value, label, multiline = false }: { value: string; label: string; multiline?: boolean }) {
  const id = useId();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      el?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="flex">
        {multiline ? (
          <textarea
            id={id}
            readOnly
            value={value}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="field h-auto min-w-0 flex-1 resize-none rounded-r-none py-2 font-mono text-xs leading-5"
          />
        ) : (
          <input
            id={id}
            readOnly
            value={value}
            onFocus={(e) => e.currentTarget.select()}
            className="field min-w-0 flex-1 rounded-r-none font-mono text-xs"
          />
        )}
        <button
          type="button"
          onClick={copy}
          className="btn btn-secondary h-auto min-h-10 flex-none rounded-l-none md:min-h-9"
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check size={16} strokeWidth={1.5} aria-hidden="true" /> : <Copy size={16} strokeWidth={1.5} aria-hidden="true" />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
}
