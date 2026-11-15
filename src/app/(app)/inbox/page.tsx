import type { Metadata } from "next";
import Link from "next/link";
import { Check, MessageSquare, PenLine } from "lucide-react";
import { MarkInboxSeen } from "@/components/studio-bell";
import { requireUser } from "@/lib/auth";
import { inboxSeenAt, studioInbox } from "@/lib/comments";

export const metadata: Metadata = { title: "Client inbox" };

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Client comments and approvals from every portal the person can see, newest first. */
export default async function InboxPage() {
  const user = await requireUser();
  const [entries, since] = await Promise.all([studioInbox(user), inboxSeenAt(user.id)]);
  const days = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = dayFmt.format(e.createdAt);
    days.set(key, [...(days.get(key) ?? []), e]);
  }

  return (
    <div className="mx-auto max-w-[880px]">
      <MarkInboxSeen />
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.02em]">Client inbox</h1>
        <p className="mt-1 text-muted">Comments and approvals clients sent from their project pages.</p>
      </div>
      {entries.length === 0 ? (
        <section className="card p-6">
          <p className="empty">Nothing yet. When a client comments on a drawing, render or 3D model, or approves a drawing, it shows here.</p>
        </section>
      ) : (
        <div className="space-y-6">
          {[...days].map(([day, list]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{day}</h2>
              <ul className="card divide-y divide-rule overflow-hidden">
                {list.map((e) => {
                  const fresh = e.createdAt > since;
                  const Icon = e.kind === "comment" ? MessageSquare : e.decision === "approved" ? Check : PenLine;
                  const tone = e.kind === "comment" ? "bg-[#f4f1ff] text-primary" : e.decision === "approved" ? "bg-[#e5f8f2] text-positive" : "bg-[#fdeee6] text-[#7d3517]";
                  return (
                    <li key={e.key}>
                      <Link href={e.href} className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[#fbfbff] md:px-5">
                        <span className={`mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-full ${tone}`} aria-hidden="true">
                          <Icon size={18} strokeWidth={1.8} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block ${fresh ? "font-semibold" : "font-medium"} group-hover:text-primary`}>
                            {e.kind === "comment"
                              ? `${e.name} commented on ${e.subject}`
                              : `${e.name} ${e.decision === "approved" ? "approved" : "requested changes on"} ${e.subject}`}
                          </span>
                          {e.body ? <span className="mt-0.5 line-clamp-2 block text-sm text-muted">“{e.body}”</span> : null}
                          <span className="num mt-0.5 block text-xs text-muted">
                            {e.projectName} · {timeFmt.format(e.createdAt)}
                          </span>
                        </span>
                        {fresh ? <span className="pill pill-warning flex-none">New</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
