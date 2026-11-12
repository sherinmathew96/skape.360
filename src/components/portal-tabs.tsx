"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PortalTab = { href: string; label: string; count?: number };

/** The client's sections; counts show only for what waits on them. */
export function PortalTabs({ tabs }: { tabs: PortalTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Project sections" className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
      <ul className="flex gap-6">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href} className="flex-none">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px flex h-11 items-center gap-2 border-b-2 ${active ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-primary"}`}
              >
                {t.label}
                {t.count ? (
                  <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#fdebdc] px-1.5 text-xs font-medium text-[#7a3608]" aria-label={`${t.count} waiting for you`}>
                    {t.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
