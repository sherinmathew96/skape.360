"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions";

/**
 * A form bound to a server action. Shows the action's error or confirmation
 * next to the submit button and clears the fields after a success.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  className = "",
  primary = true,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  pendingLabel: string;
  children: React.ReactNode;
  className?: string;
  primary?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const message = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
    // Bring keyboard and screen-reader users to what went wrong.
    if (state?.error) message.current?.focus();
  }, [state]);

  return (
    <form
      ref={ref}
      className={className}
      // Submitted by hand so the fields keep their values when the action
      // returns an error (React resets a form after its action runs).
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => dispatch(data));
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className={`btn ${primary ? "btn-primary" : "btn-secondary"}`}>
          {pending ? pendingLabel : submitLabel}
        </button>
        <p ref={message} tabIndex={-1} aria-live="polite" className={state?.error ? "text-negative" : "text-muted"}>
          {state?.error ?? state?.ok ?? ""}
        </p>
      </div>
    </form>
  );
}
