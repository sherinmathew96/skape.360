"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { markPortalSeen } from "@/app/portal-talk-actions";

const SEEN_EVENT = "skape:portal-seen";

/** The bell in the client's header: how many updates are new since they last looked. */
export function PortalBell({ href, unread }: { href: string; unread: number }) {
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    const clear = () => setCleared(true);
    window.addEventListener(SEEN_EVENT, clear);
    return () => window.removeEventListener(SEEN_EVENT, clear);
  }, []);
  const n = cleared ? 0 : unread;
  const label = n ? `Updates, ${n} new` : "Updates";
  return (
    <Link href={href} aria-label={label} title={label} className="relative flex h-10 w-10 flex-none items-center justify-center rounded-full text-muted transition-colors hover:bg-ground hover:text-primary">
      <Bell size={20} strokeWidth={1.7} aria-hidden="true" />
      {n ? (
        <span className="num absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-negative px-1 text-[11px] font-semibold text-white" aria-hidden="true">
          {n > 9 ? "9+" : n}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * On the updates page: records that this device has seen them. The list
 * keeps its "New" marks for this visit; the bell clears straight away.
 */
export function MarkPortalSeen({ slug }: { slug: string }) {
  useEffect(() => {
    markPortalSeen(slug).then(() => window.dispatchEvent(new Event(SEEN_EVENT)));
  }, [slug]);
  return null;
}
