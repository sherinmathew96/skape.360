"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SettingsTab = { href: string; label: string };

/** The sections of Settings, scrolling sideways on a phone. */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();
  // The longest matching address wins, so /team/roles lights Roles, not People.
  const active = tabs
    .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Settings" className="-mx-4 mb-6 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0">
      <ul className="flex gap-6">
        {tabs.map((t) => (
          <li key={t.href} className="flex-none">
            <Link
              href={t.href}
              aria-current={t.href === active ? "page" : undefined}
              className={`-mb-px flex h-11 items-center border-b-2 ${t.href === active ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-primary"}`}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
