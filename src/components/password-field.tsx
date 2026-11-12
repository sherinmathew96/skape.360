"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** A password input with a Show/Hide button, so look-alike letters can be checked. */
export function PasswordField({ id, name, autoComplete }: { id: string; name: string; autoComplete: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        className="field pr-11"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted hover:text-text"
      >
        {shown ? <EyeOff size={16} strokeWidth={1.5} aria-hidden="true" /> : <Eye size={16} strokeWidth={1.5} aria-hidden="true" />}
      </button>
    </div>
  );
}
