"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Link2, MessageCircle } from "lucide-react";
import { quickShareLink } from "@/app/studio-actions";
import { CopyField } from "./copy-field";

/** One click to a short client link, ready to paste or send on WhatsApp. */
export function SendToClient({
  projectId,
  itemType,
  itemId,
  title,
  origin,
}: {
  projectId: string;
  itemType: "model" | "tour";
  itemId: string;
  title: string;
  origin: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!url) {
    return (
      <div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                setUrl(`${origin}/s/${await quickShareLink({ projectId, itemType, itemId })}`);
              } catch {
                setError("Couldn't make the link. Try again.");
              }
            })
          }
        >
          <Link2 size={16} strokeWidth={1.5} aria-hidden="true" /> {pending ? "Making link…" : "Make client link"}
        </button>
        {error ? <p role="alert" className="mt-2 text-negative">{error}</p> : null}
      </div>
    );
  }

  const message = `${title}: have a look at the ${itemType === "model" ? "3D model" : "360° tour"} here ${url}`;
  return (
    <div className="space-y-3">
      <CopyField label="Client link" value={url} />
      <div className="flex flex-wrap gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="btn btn-secondary">
          <MessageCircle size={16} strokeWidth={1.5} aria-hidden="true" /> Send on WhatsApp
        </a>
        <Link href={`/projects/${projectId}/sharing`} className="btn btn-quiet">Passcode, expiry, views</Link>
      </div>
      <p className="text-xs text-muted">Opens on any phone without an account. You can switch it off any time under Client sharing.</p>
    </div>
  );
}
