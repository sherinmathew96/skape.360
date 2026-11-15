"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { markInboxSeen } from "@/app/comment-actions";

const SEEN_EVENT = "skape:inbox-seen";

/** The studio's bell: client comments and approvals since this person last opened the inbox. */
export function StudioBell({ unread, className = "" }: { unread: number; className?: string }) {
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    const clear = () => setCleared(true);
    window.addEventListener(SEEN_EVENT, clear);
    return () => window.removeEventListener(SEEN_EVENT, clear);
  }, []);
  const n = cleared ? 0 : unread;
  const label = n ? `Client inbox, ${n} new` : "Client inbox";
  return (
    <Link href="/inbox" aria-label={label} title={label} className={`relative flex h-11 w-11 flex-none items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-primary ${className}`}>
      <Bell size={20} strokeWidth={1.7} aria-hidden="true" />
      {n ? (
        <span className="num absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-negative px-1 text-[11px] font-semibold text-white" aria-hidden="true">
          {n > 9 ? "9+" : n}
        </span>
      ) : null}
    </Link>
  );
}

/** On the inbox page: records it as read; the list keeps its "New" marks for this visit. */
export function MarkInboxSeen() {
  useEffect(() => {
    markInboxSeen().then(() => window.dispatchEvent(new Event(SEEN_EVENT)));
  }, []);
  return null;
}
