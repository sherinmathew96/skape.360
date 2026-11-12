"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary">
      <Printer size={16} strokeWidth={1.5} aria-hidden="true" /> Print or save as PDF
    </button>
  );
}
