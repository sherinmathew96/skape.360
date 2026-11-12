"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export type ProjectTableRow = {
  id: string;
  code: string;
  name: string;
  clientName: string;
  location: string | null;
  stage: string;
  stageProgress: string;
  tasksOpen: number;
  tasksOverdue: number;
  dueDate: string | null;
  dueLabel: string;
  status: { label: string; tone: string };
};

const SORTS = {
  due: { label: "Completion", by: (a: ProjectTableRow, b: ProjectTableRow) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") },
  late: { label: "Most late", by: (a: ProjectTableRow, b: ProjectTableRow) => b.tasksOverdue - a.tasksOverdue || a.name.localeCompare(b.name) },
  name: { label: "Name", by: (a: ProjectTableRow, b: ProjectTableRow) => a.name.localeCompare(b.name) },
};
type SortKey = keyof typeof SORTS;

/** The projects table on the overview: search and sort as you type, no reload. */
export function ProjectTable({ rows, title, subtitle }: { rows: ProjectTableRow[]; title: string; subtitle: string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("due");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => [r.name, r.clientName, r.code, r.location ?? "", r.stage].some((v) => v.toLowerCase().includes(q))) : rows;
    return [...list].sort(SORTS[sort].by);
  }, [rows, query, sort]);

  return (
    <section className="card overflow-hidden" aria-labelledby="projects-title">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-6 pb-5 pt-7 md:px-8">
        <div>
          <h2 id="projects-title" className="text-[22px] font-semibold leading-7 tracking-[-0.01em]">{title}</h2>
          <p className="mt-1 text-sm font-medium text-positive">{subtitle}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="relative min-w-0 basis-full sm:basis-auto sm:w-[220px]">
            <label htmlFor="project-filter" className="sr-only">Filter projects</label>
            <Search size={18} strokeWidth={1.6} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9197b3]" />
            <input
              id="project-filter"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              autoComplete="off"
              className="field h-10 border-transparent pl-10"
            />
          </div>
          <div className="relative">
            <label htmlFor="project-sort" className="sr-only">Sort projects</label>
            <select
              id="project-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="field h-10 w-auto cursor-pointer appearance-none border-transparent pl-3.5 pr-9 text-[13px] font-medium"
            >
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>Sort by: {v.label}</option>
              ))}
            </select>
            <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="empty mx-6 mb-6 md:mx-8">{rows.length ? `No project matches “${query}”.` : "No projects yet."}</p>
      ) : (
        <>
          {/* Phone: one block per project. */}
          <ul className="md:hidden">
            {shown.map((r) => (
              <li key={r.id} className="border-t border-rule">
                <Link href={`/projects/${r.id}`} className="block px-6 py-4 transition-colors active:bg-active">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-xs leading-5 text-muted">{r.clientName}</span>
                    </span>
                    <span className={`pill ${r.status.tone}`}>{r.status.label}</span>
                  </span>
                  <span className="mt-2 flex justify-between gap-3 text-xs text-muted">
                    <span className="truncate">{r.stage}</span>
                    <span className="num flex-none">{r.dueLabel}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: the table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" className="!pl-8">Project</th>
                  <th scope="col">Client</th>
                  <th scope="col">Stage</th>
                  <th scope="col" className="num">Open tasks</th>
                  <th scope="col">Completion</th>
                  <th scope="col" className="!pr-8 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="relative">
                    <td className="!pl-8">
                      <Link href={`/projects/${r.id}`} className="font-medium after:absolute after:inset-0 hover:text-primary">
                        {r.name}
                      </Link>
                      <span className="block text-xs text-muted">{r.code}</span>
                    </td>
                    <td>{r.clientName}</td>
                    <td>
                      {r.stage}
                      <span className="block text-xs text-muted">{r.stageProgress}</span>
                    </td>
                    <td className="num">
                      {r.tasksOpen}
                      {r.tasksOverdue ? <span className="block text-xs font-medium text-negative">{r.tasksOverdue} late</span> : null}
                    </td>
                    <td className="num">{r.dueLabel}</td>
                    <td className="!pr-8 text-center">
                      <span className={`pill min-w-[92px] ${r.status.tone}`}>{r.status.label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
