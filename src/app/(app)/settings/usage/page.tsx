import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Database, HardDrive } from "lucide-react";
import { SettingsHeader } from "@/components/settings-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { databaseUsage, formatBytes, storageUsage } from "@/lib/usage";

export const metadata: Metadata = { title: "Usage" };

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** A bar against a plan's allowance, so the numbers mean something at a glance. */
function Meter({ bytes, limit, label }: { bytes: number; limit: number; label: string }) {
  const pct = Math.min(100, (bytes / limit) * 100);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">{label}</span>
        <span className="num font-medium">{pct < 1 ? "under 1" : Math.round(pct)}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={`${Math.round(pct)}% of ${label}`}>
        <div className={`h-full rounded-full ${pct > 85 ? "bg-negative" : pct > 60 ? "bg-[#f0a020]" : "bg-primary"}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
    </div>
  );
}

/** Live figures read from the database and the file store on every visit. */
export default async function UsagePage() {
  const user = await requireUser();
  if (!can(user, "staff.manage")) redirect("/settings");
  const [db, files] = await Promise.all([
    databaseUsage().catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
    storageUsage().catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
  ]);

  return (
    <div className="mx-auto max-w-[1136px]">
      <SettingsHeader user={user} subtitle="Read live from the database and file storage each time you open this page." />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section className="card p-6" aria-labelledby="db-title">
          <div className="mb-5 flex items-center gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-mint text-mint-ink" aria-hidden="true">
              <Database size={22} strokeWidth={1.6} />
            </span>
            <div>
              <h2 id="db-title" className="card-title">Database</h2>
              <p className="text-xs text-muted">{"error" in db ? "Supabase" : db.provider}</p>
            </div>
          </div>
          {"error" in db ? (
            <p role="alert" className="empty">Couldn&rsquo;t read the database size: {db.error}</p>
          ) : (
            <>
              <p className="num text-[32px] font-semibold leading-10 tracking-[-0.02em]">{formatBytes(db.bytes)}</p>
              <p className="mb-5 text-sm text-muted">Records, accounts and settings. Files live in storage, not here.</p>
              <div className="space-y-4">
                <Meter bytes={db.bytes} limit={500 * MB} label="of Supabase Free (500 MB)" />
                <Meter bytes={db.bytes} limit={8 * GB} label="of Supabase Pro (8 GB)" />
              </div>
              <h3 className="mb-2 mt-6 text-sm font-semibold">Largest tables</h3>
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="!pl-0">Table</th>
                    <th scope="col" className="num">Rows</th>
                    <th scope="col" className="num !pr-0">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {db.tables.map((t) => (
                    <tr key={t.name}>
                      <td className="!pl-0 !py-2.5 font-mono text-xs">{t.name}</td>
                      <td className="num !py-2.5">{t.rows.toLocaleString("en-IN")}</td>
                      <td className="num !pr-0 !py-2.5">{formatBytes(t.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className="card p-6" aria-labelledby="files-title">
          <div className="mb-5 flex items-center gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-active text-primary" aria-hidden="true">
              <HardDrive size={22} strokeWidth={1.6} />
            </span>
            <div>
              <h2 id="files-title" className="card-title">File storage</h2>
              <p className="text-xs text-muted">{"error" in files ? "Cloudflare R2" : files.provider}</p>
            </div>
          </div>
          {"error" in files ? (
            <p role="alert" className="empty">Couldn&rsquo;t read file storage: {files.error}</p>
          ) : (
            <>
              <p className="num text-[32px] font-semibold leading-10 tracking-[-0.02em]">{formatBytes(files.bytes)}</p>
              <p className="mb-5 text-sm text-muted">
                {files.count.toLocaleString("en-IN")} {files.count === 1 ? "file" : "files"}: models, 360° photos, drawings and photos, including items in the recycle bin.
              </p>
              <Meter bytes={files.bytes} limit={10 * GB} label="of R2's free 10 GB" />
              <h3 className="mb-2 mt-6 text-sm font-semibold">By kind</h3>
              {files.groups.length === 0 ? (
                <p className="text-sm text-muted">Nothing stored yet.</p>
              ) : (
                <ul className="space-y-3">
                  {files.groups.map((g) => (
                    <li key={g.label}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span>
                          {g.label} <span className="num text-xs text-muted">· {g.count}</span>
                        </span>
                        <span className="num font-medium">{formatBytes(g.bytes)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${files.bytes ? Math.max(1, (g.bytes / files.bytes) * 100) : 0}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
      <p className="mt-4 text-xs text-muted">
        Plan figures are for reference; check your actual plan in the Supabase and Cloudflare dashboards. Hosting use (Vercel) is not shown here.
      </p>
    </div>
  );
}
