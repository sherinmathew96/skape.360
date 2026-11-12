"use client";

import { useState } from "react";
import { clientDecision } from "@/app/drawing-actions";
import { ActionForm } from "./action-form";

/** Approve, or ask for changes, on the drawing revision a client is looking at. */
export function ClientDecision({ token, portal, revisionId, label }: { token?: string; portal?: string; revisionId: string; label: string }) {
  const [decision, setDecision] = useState<"approved" | "changes_requested">("approved");
  const id = revisionId.slice(0, 8);
  return (
    <ActionForm
      action={clientDecision}
      submitLabel={decision === "approved" ? `Approve ${label}` : "Send changes"}
      pendingLabel="Sending…"
      className="space-y-4"
    >
      {portal ? <input type="hidden" name="portal" value={portal} /> : <input type="hidden" name="token" value={token} />}
      <input type="hidden" name="revisionId" value={revisionId} />
      <fieldset>
        <legend className="field-label">Your decision</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="decision"
              value="approved"
              checked={decision === "approved"}
              onChange={() => setDecision("approved")}
              className="h-5 w-5 accent-primary"
            />
            Approve
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="decision"
              value="changes_requested"
              checked={decision === "changes_requested"}
              onChange={() => setDecision("changes_requested")}
              className="h-5 w-5 accent-primary"
            />
            Ask for changes
          </label>
        </div>
      </fieldset>
      <div>
        <label htmlFor={`name-${id}`} className="field-label">Your name</label>
        <input id={`name-${id}`} name="name" required autoComplete="name" className="field" />
      </div>
      <div>
        <label htmlFor={`comment-${id}`} className="field-label">
          {decision === "approved" ? "Comments (optional)" : "What should change"}
        </label>
        <textarea id={`comment-${id}`} name="comment" rows={3} required={decision !== "approved"} className="field h-auto py-2" />
      </div>
    </ActionForm>
  );
}
