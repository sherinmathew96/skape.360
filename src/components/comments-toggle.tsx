"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { ClientThread, type ThreadItem } from "./comment-thread";

/** A "Comments" button that opens the client's thread below it. */
export function CommentsToggle({ slug, item, title }: { slug: string; item: ThreadItem; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`btn h-10 gap-2 px-3 text-sm ${open ? "btn-primary" : "btn-secondary"}`}>
        <MessageSquare size={16} strokeWidth={1.8} aria-hidden="true" />
        Comments
      </button>
      {open ? (
        <div className="card mt-3 h-[420px] overflow-hidden" aria-label={`Comments on ${title}`} role="region">
          <ClientThread slug={slug} item={item} />
        </div>
      ) : null}
    </div>
  );
}
