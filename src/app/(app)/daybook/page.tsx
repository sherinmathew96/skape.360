import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DayBookView } from "@/components/day-book-view";
import { requireUser } from "@/lib/auth";
import { listProjects } from "@/lib/data";
import { today } from "@/lib/dates";
import { monthRange, projectBooks } from "@/lib/daybook";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Day book" };

/**
 * The office's own day book (rent, bills, office supplies, fees received),
 * with every construction project's book for the same month below it.
 */
export default async function OfficeDayBookPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  if (!can(user, "finance.view")) redirect("/");
  const t = today();
  const asked = (await searchParams).month ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) && asked <= t.slice(0, 7) ? asked : t.slice(0, 7);
  const { from, to } = monthRange(month);
  const projects = (await listProjects(user)).filter((p) => p.status === "active" || p.status === "on_hold");
  const books = await projectBooks(from, to, projects);

  return (
    <div className="mx-auto max-w-[1136px]">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.02em]">Day book</h1>
        <p className="mt-1 text-muted">Office money in and out, day by day. Each construction project keeps its own book.</p>
      </div>

      <DayBookView user={user} projectId={null} month={month} basePath="/daybook" canWrite={can(user, "finance.manage")} today={t} />

      {books.length ? (
        <section className="card mt-6 overflow-hidden" aria-labelledby="projects-title">
          <div className="px-6 pb-3 pt-6">
            <h2 id="projects-title" className="card-title">Project day books</h2>
            <p className="text-sm text-muted">Construction projects, for the same month.</p>
          </div>
          <ul>
            {books.map((b) => (
              <li key={b.id} className="border-t border-rule">
                <Link href={`/projects/${b.id}/daybook?month=${month}`} className="group flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-4 transition-colors hover:bg-[#fbfbff]">
                  <span className="min-w-0 flex-1 truncate font-medium group-hover:text-primary">{b.name}</span>
                  <span className="num text-sm text-positive">+{formatINR(b.inPaise)}</span>
                  <span className="num text-sm text-negative">−{formatINR(b.outPaise)}</span>
                  <span className={`num w-28 text-right text-sm font-semibold ${b.inPaise - b.outPaise < 0 ? "text-negative" : ""}`}>{formatINR(b.inPaise - b.outPaise)}</span>
                  <ArrowRight size={16} strokeWidth={1.6} aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
