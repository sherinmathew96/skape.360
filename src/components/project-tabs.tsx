"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Site and Snags only appear on projects with construction work. */
export function ProjectTabs({ projectId, construction = true }: { projectId: string; construction?: boolean }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const tabs = [
    { href: base, label: "Overview", active: pathname === base },
    { href: `${base}/drawings`, label: "Drawings", active: pathname.startsWith(`${base}/drawings`) },
    { href: `${base}/models`, label: "3D models", active: pathname.startsWith(`${base}/models`) },
    { href: `${base}/tours`, label: "360° tours", active: pathname.startsWith(`${base}/tours`) },
    ...(construction
      ? [
          { href: `${base}/site`, label: "Site", active: pathname.startsWith(`${base}/site`) },
          { href: `${base}/snags`, label: "Snags", active: pathname.startsWith(`${base}/snags`) },
        ]
      : []),
    { href: `${base}/sharing`, label: "Client sharing", active: pathname.startsWith(`${base}/sharing`) },
  ];
  return (
    <nav aria-label="Project sections" className="-mx-4 mt-5 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0">
      <ul className="flex gap-6">
        {tabs.map((t) => (
          <li key={t.href} className="flex-none">
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`-mb-px flex h-10 items-center border-b-2 ${
                t.active ? "border-text font-medium text-text" : "border-transparent text-muted hover:text-text"
              }`}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
