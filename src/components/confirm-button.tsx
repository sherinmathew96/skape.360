"use client";

import { useFormStatus } from "react-dom";

/** A submit button for destructive actions: asks first, in the negative colour. */
export function ConfirmButton({ message, children }: { message: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className="btn border border-[#e7b4b1] bg-surface text-negative hover:bg-[#fff5f4]"
    >
      {pending ? "Working…" : children}
    </button>
  );
}
