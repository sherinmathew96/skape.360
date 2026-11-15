"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PortalTab = { href: string; label: string; count?: number };

/**
 * The client's sections as pill tabs. On a wide screen they sit in one row;
 * on a phone the row slides sideways, with no scrollbar showing.
 */
export function PortalTabs({ tabs }: { tabs: PortalTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Project sections" className="-mx-5 overflow-x-auto overflow-y-hidden px-5 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-1 pb-3 md:w-auto md:flex-wrap">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href} className="flex-none">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-colors ${
                  active ? "bg-[#f1edff] font-semibold text-primary" : "text-muted hover:bg-ground hover:text-text"
                }`}
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
