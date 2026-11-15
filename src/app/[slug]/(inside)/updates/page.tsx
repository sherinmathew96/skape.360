import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, CheckCircle2, FileText, Flag, HardHat, Image as ImageIcon, MessageSquare, Orbit } from "lucide-react";
import { MarkPortalSeen } from "@/components/portal-bell";
import { portalSeenAt, portalUpdates } from "@/lib/client-updates";
import { loadPortal } from "@/lib/portal";

type Props = { params: Promise<{ slug: string }> };

const ICON = { revision: FileText, status: Flag, model: Box, tour: Orbit, render: ImageIcon, site: HardHat, work: CheckCircle2, reply: MessageSquare } as const;
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { portal } = await loadPortal((await params).slug);
  return { title: { absolute: portal ? `${portal.projectName} · Updates` : "Studio Skape" }, robots: { index: false, follow: false } };
}

/** Everything the studio has added for the client, newest first; what's new since the last visit is marked. */
export default async function PortalUpdatesPage({ params }: Props) {
  const { portal } = await loadPortal((await params).slug);
  if (!portal) notFound();
  const [updates, seen] = await Promise.all([portalUpdates(portal), portalSeenAt(portal.id)]);
  const days = new Map<string, typeof updates>();
  for (const u of updates) {
    const key = dayFmt.format(u.createdAt);
    days.set(key, [...(days.get(key) ?? []), u]);
  }

  return (
    <>
      <MarkPortalSeen slug={portal.slug} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Updates</h1>
        <p className="mt-1 text-muted">What Studio Skape has added or changed on your project.</p>
      </div>
      {updates.length === 0 ? (
        <p className="empty">Nothing yet. New drawings, renders, 3D models, site updates and replies appear here.</p>
      ) : (
        <div className="space-y-6">
          {[...days].map(([day, list]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{day}</h2>
              <ul className="card divide-y divide-rule overflow-hidden">
                {list.map((u) => {
                  const Icon = ICON[u.kind as keyof typeof ICON] ?? FileText;
                  const fresh = u.createdAt > seen;
                  return (
                    <li key={u.id}>
                      <Link href={`/${portal.slug}/${u.href}`} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#fbfbff] md:px-5">
                        <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${fresh ? "bg-[#f4f1ff] text-primary" : "bg-raised text-muted"}`} aria-hidden="true">
                          <Icon size={18} strokeWidth={1.7} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate ${fresh ? "font-semibold" : "font-medium"} group-hover:text-primary`}>{u.title}</span>
                          <span className="num block text-xs text-muted">{timeFmt.format(u.createdAt)}</span>
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
    </>
  );
}
