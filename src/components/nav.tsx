"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, LayoutDashboard, ListChecks, Settings, ShoppingCart, Truck, Users } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "My tasks", icon: ListChecks },
  { href: "/team", label: "Team", icon: Users },
];

/** Office pages, shown in the sidebar to the roles that use them. */
const OFFICE = {
  purchasing: { href: "/purchasing", label: "Purchasing", icon: ShoppingCart },
  suppliers: { href: "/suppliers", label: "Suppliers", icon: Truck },
  settings: { href: "/settings", label: "Settings", icon: Settings },
};
export type OfficeLink = keyof typeof OFFICE;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Desktop sidebar links. `myOverdue` badges the one queue that needs action. */
export function SidebarNav({ myOverdue, office = [], waiting = 0 }: { myOverdue: number; office?: OfficeLink[]; waiting?: number }) {
  const pathname = usePathname();
  const items = [...ITEMS, ...office.map((k) => OFFICE[k])];
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 transition-colors ${
              active ? "bg-active text-text" : "text-muted hover:bg-active hover:text-text"
            }`}
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {href === "/tasks" && myOverdue > 0 ? (
              <span className="num text-xs text-negative" aria-label={`${myOverdue} overdue`}>
                {myOverdue} late
              </span>
            ) : null}
            {href === "/purchasing" && waiting > 0 ? (
              <span className="num text-xs text-muted" aria-label={`${waiting} requests waiting for approval`}>
                {waiting} to approve
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone bottom bar: the same four destinations, thumb-sized. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-14 flex-col items-center justify-center gap-1 text-xs ${
              active ? "font-medium text-text" : "text-muted"
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
