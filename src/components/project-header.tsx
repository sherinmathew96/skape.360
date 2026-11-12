import Link from "next/link";
import { ProjectTabs } from "./project-tabs";

/** Breadcrumb, title and the project's section tabs, shared by every project page. */
export function ProjectHeader({
  project,
  subtitle,
  crumbs = [],
  actions,
  badge,
}: {
  project: { id: string; code: string; name: string };
  subtitle?: string;
  crumbs?: { href: string; label: string }[];
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <p className="mb-2 truncate text-muted">
        <Link href="/projects" className="hover:text-text hover:underline">Projects</Link> /{" "}
        <Link href={`/projects/${project.id}`} className="font-mono hover:text-text hover:underline">{project.code}</Link>
        {crumbs.map((c) => (
          <span key={c.href}>
            {" / "}
            <Link href={c.href} className="hover:text-text hover:underline">{c.label}</Link>
          </span>
        ))}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">{project.name}</h1>
            {badge}
          </div>
          {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      <ProjectTabs projectId={project.id} />
    </div>
  );
}
