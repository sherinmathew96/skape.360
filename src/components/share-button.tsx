"use client";

import { useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { shareLink } from "@/app/drawing-actions";
import { portalShareLink } from "@/app/portal-talk-actions";

/**
 * Shares one group or drawing at its own address. On a phone it opens the
 * phone's share sheet; elsewhere it copies the link and says so.
 */
export function ShareButton({
  kind,
  id,
  name,
  projectId,
  portalSlug,
}: {
  kind: "group" | "drawing";
  id: string;
  name: string;
  /** From the studio */
  projectId?: string;
  /** From the client's portal */
  portalSlug?: string;
}) {
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (text: string, error = false) => {
    setNote({ text, error });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), error ? 5000 : 2200);
  };

  const share = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = projectId ? await shareLink({ projectId, kind, id }) : await portalShareLink(portalSlug ?? "", kind, id);
      if ("error" in res) return show(res.error, true);
      const phone = window.matchMedia("(pointer: coarse)").matches;
      if (phone && navigator.share) {
        try {
          await navigator.share({ title: name, url: res.url });
          return;
        } catch {
          // Closed the sheet, or sharing isn't allowed: copy instead.
        }
      }
      try {
        await navigator.clipboard.writeText(res.url);
        show("Link copied");
      } catch {
        window.prompt("Copy this link", res.url);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="btn btn-quiet h-8 w-8 p-0 text-muted hover:text-primary"
        aria-label={kind === "group" ? `Share the group ${name}` : `Share ${name}`}
        title="Share link"
      >
        {note && !note.error ? <Check size={15} strokeWidth={2} aria-hidden="true" className="text-positive" /> : <Share2 size={15} strokeWidth={1.6} aria-hidden="true" />}
      </button>
      <span
        role="status"
        className={`pointer-events-none absolute right-full top-1/2 z-20 mr-2 w-max max-w-[240px] -translate-y-1/2 rounded-md px-2.5 py-1.5 text-xs shadow-md transition-opacity ${
          note ? "opacity-100" : "opacity-0"
        } ${note?.error ? "bg-[#fff5f4] text-negative" : "bg-text text-white"}`}
      >
        {note?.text ?? ""}
      </span>
    </span>
  );
}
