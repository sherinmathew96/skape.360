import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { setProjectFirm } from "@/app/firm-actions";
import { ActionForm } from "@/components/action-form";
import { CopyField } from "@/components/copy-field";
import { FirmForm } from "@/components/firm-form";
import { requireUser } from "@/lib/auth";
import { listProjects } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { firmProjects, getFirm } from "@/lib/firms";
import { appOrigin } from "@/lib/origin";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Firm" };

const timeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default async function FirmPage({ params }: { params: Promise<{ firmId: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "projects.create")) redirect("/");
  const firm = await getFirm((await params).firmId);
  if (!firm) notFound();
  const [projects, all, origin] = await Promise.all([firmProjects(firm.id), listProjects(user), appOrigin()]);
  const host = origin.replace(/^https?:\/\//, "");
  const others = all.filter((p) => p.firmId !== firm.id);

  return (
    <div className="mx-auto max-w-[1136px]">
      <p className="mb-2 text-muted">
        <Link href="/firms" className="hover:text-primary hover:underline">Firms</Link> / {firm.name}
      </p>
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.02em]">{firm.name}</h1>
        <p className="mt-1 text-muted">
          {[firm.contactName, firm.phone, firm.email].filter(Boolean).join(" · ") || "No contact details yet."}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <section className="card p-6" aria-labelledby="page-title">
            <h2 id="page-title" className="card-title mb-1">The firm&rsquo;s page</h2>
            <p className="mb-4 text-muted">
              {firm.enabled
                ? "Send this to the firm. They see a card for each project below and open each one like a client would."
                : "Closed. The address shows nothing until you open it again."}
            </p>
            {firm.enabled ? <CopyField label={`Page for ${firm.name}`} value={`${origin}/${firm.slug}`} /> : null}
            <p className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                {firm.passcodeHash ? "Passcode needed" : "No passcode"} · {firm.views} {firm.views === 1 ? "visit" : "visits"}
                {firm.lastViewedAt ? `, last ${timeFmt.format(firm.lastViewedAt)}` : ""}
              </span>
              {firm.enabled ? (
                <a href={`/${firm.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  Open the page <ExternalLink size={12} strokeWidth={1.8} aria-hidden="true" />
                </a>
              ) : null}
            </p>
          </section>

          <section className="card overflow-hidden" aria-labelledby="projects-title">
            <div className="flex items-baseline justify-between gap-4 px-6 pb-3 pt-6">
              <h2 id="projects-title" className="card-title">Projects for {firm.name}</h2>
              <p className="num text-sm text-muted">{projects.length}</p>
            </div>
            {projects.length === 0 ? (
              <p className="empty mx-6 mb-6">No projects yet. Choose this firm when you create a project, or add an existing one below.</p>
            ) : (
              <ul>
                {projects.map((p) => (
                  <li key={p.id} className="flex items-center gap-4 border-t border-rule px-6 py-4">
                    <span className="min-w-0 flex-1">
                      <Link href={`/projects/${p.id}`} className="block truncate font-medium hover:text-primary">{p.name}</Link>
                      <span className="block truncate text-xs leading-5 text-muted">
                        {[p.clientName, p.location, p.stage].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="num hidden flex-none text-right text-sm text-muted sm:block">{formatDate(p.dueDate)}</span>
                    {p.portalSlug ? (
                      <a href={`/${p.portalSlug}`} target="_blank" rel="noreferrer" className="btn btn-secondary h-9 flex-none px-3 text-xs">
                        Client view
                      </a>
                    ) : (
                      <span className="pill">No page</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {others.length ? (
              <div className="border-t border-border bg-ground/60 p-6">
                <ActionForm action={setProjectFirm} submitLabel="Add to this firm" pendingLabel="Adding…" primary={false} className="space-y-3">
                  <input type="hidden" name="firmId" value={firm.id} />
                  <div>
                    <label htmlFor="add-project" className="field-label">Add an existing project</label>
                    <select id="add-project" name="projectId" className="field">
                      {others.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.firmName ? ` (now with ${p.firmName})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </ActionForm>
              </div>
            ) : null}
          </section>
        </div>

        <section className="card p-6" aria-labelledby="edit-title">
          <h2 id="edit-title" className="card-title mb-4">Details</h2>
          <FirmForm
            host={host}
            firm={{
              id: firm.id,
              name: firm.name,
              slug: firm.slug,
              contactName: firm.contactName,
              phone: firm.phone,
              email: firm.email,
              enabled: firm.enabled,
              hasPasscode: Boolean(firm.passcodeHash),
            }}
          />
        </section>
      </div>
    </div>
  );
}
