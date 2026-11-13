import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, Lock } from "lucide-react";
import { FirmForm } from "@/components/firm-form";
import { requireUser } from "@/lib/auth";
import { listFirms } from "@/lib/firms";
import { appOrigin } from "@/lib/origin";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Firms" };

/** Contractors and PMCs the studio designs for, each with its own page of projects. */
export default async function FirmsPage() {
  const user = await requireUser();
  if (!can(user, "projects.create")) redirect("/");
  const [firms, origin] = await Promise.all([listFirms(), appOrigin()]);
  const host = origin.replace(/^https?:\/\//, "");
  const projects = firms.reduce((n, f) => n + f.projects, 0);

  return (
    <div className="mx-auto max-w-[1136px]">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.02em]">Firms</h1>
        <p className="mt-1 text-muted">
          {firms.length
            ? `${firms.length} ${firms.length === 1 ? "firm" : "firms"}, ${projects} ${projects === 1 ? "project" : "projects"}. Each firm sees its projects on its own page.`
            : "Contractors and PMCs you design for. Each gets a page listing the projects you did for them."}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden" aria-labelledby="firms-title">
          <h2 id="firms-title" className="card-title px-6 pb-3 pt-6">All firms</h2>
          {firms.length === 0 ? (
            <p className="empty mx-6 mb-6">No firms yet. Add the first one on the right, then choose it when you create a project.</p>
          ) : (
            <ul>
              {firms.map((f) => (
                <li key={f.id} className="border-t border-rule">
                  <Link href={`/firms/${f.id}`} className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[#fbfbff]">
                    <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-active text-primary" aria-hidden="true">
                      <Building2 size={22} strokeWidth={1.6} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="truncate">{f.name}</span>
                        {f.hasPasscode ? <Lock size={13} strokeWidth={1.8} className="flex-none text-muted" aria-label="Needs a passcode" /> : null}
                      </span>
                      <span className="block truncate text-xs leading-5 text-muted">
                        {host}/{f.slug}
                        {f.contactName ? ` · ${f.contactName}` : ""}
                      </span>
                    </span>
                    <span className="num hidden flex-none text-right text-sm sm:block">
                      {f.projects} {f.projects === 1 ? "project" : "projects"}
                      <span className="block text-xs text-muted">{f.views} {f.views === 1 ? "visit" : "visits"}</span>
                    </span>
                    {f.enabled ? <span className="pill pill-positive hidden md:inline-flex">Open</span> : <span className="pill hidden md:inline-flex">Closed</span>}
                    <ArrowRight size={16} strokeWidth={1.6} aria-hidden="true" className="flex-none text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6" aria-labelledby="new-firm-title">
          <h2 id="new-firm-title" className="card-title mb-4">Add a firm</h2>
          <FirmForm host={host} />
        </section>
      </div>
    </div>
  );
}
