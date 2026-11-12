"use client";

import { useState, useTransition } from "react";
import { Code } from "lucide-react";
import { getEmbedToken } from "@/app/studio-actions";
import type { ShareItemType } from "@/db/schema";
import { CopyField } from "./copy-field";

/** Shows the <iframe> code for putting this model or tour on another website. */
export function EmbedCode({
  projectId,
  itemType,
  itemId,
  title,
  origin,
  initialToken,
}: {
  projectId: string;
  itemType: ShareItemType;
  itemId: string;
  title: string;
  origin: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState(initialToken);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                setToken(await getEmbedToken({ projectId, itemType, itemId }));
              } catch {
                setError("Could not make the embed code. Try again.");
              }
            })
          }
        >
          <Code size={16} strokeWidth={1.5} aria-hidden="true" />
          {pending ? "Making code…" : "Get embed code"}
        </button>
        {error ? <p role="alert" className="mt-2 text-negative">{error}</p> : null}
      </div>
    );
  }

  const url = `${origin}/e/${token}`;
  const safeTitle = title.replace(/"/g, "&quot;");
  const code = `<iframe src="${url}" title="${safeTitle}" width="100%" height="560" style="border:0" allow="fullscreen; xr-spatial-tracking" allowfullscreen loading="lazy"></iframe>`;
  return (
    <div className="space-y-3">
      <CopyField label="Embed code" value={code} multiline />
      <CopyField label="Direct link" value={url} />
      <p className="text-xs text-muted">
        Anyone with this code can view it. Revoke it under Client sharing to stop it working everywhere.
      </p>
    </div>
  );
}
