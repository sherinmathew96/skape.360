"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** People and Roles, the two halves of the Team page. */
export function TeamTabs({ showRoles }: { showRoles: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/team", label: "People", active: pathname === "/team" },
    ...(showRoles ? [{ href: "/team/roles", label: "Roles and access", active: pathname.startsWith("/team/roles") }] : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Team" className="mb-6 border-b border-border">
      <ul className="flex gap-6">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`-mb-px flex h-11 items-center border-b-2 ${t.active ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-primary"}`}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
