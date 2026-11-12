"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, FolderKanban, IndianRupee, LayoutDashboard, ListChecks, Settings, ShoppingCart, Truck, Users } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "My tasks", icon: ListChecks },
  { href: "/team", label: "Team", icon: Users },
];

/** Office pages, shown in the sidebar to the roles that use them. */
const OFFICE = {
  finance: { href: "/finance", label: "Finance", icon: IndianRupee },
  purchasing: { href: "/purchasing", label: "Purchasing", icon: ShoppingCart },
  suppliers: { href: "/suppliers", label: "Suppliers", icon: Truck },
  settings: { href: "/settings", label: "Settings", icon: Settings },
};
export type OfficeLink = keyof typeof OFFICE;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Desktop sidebar links: the current page is filled violet. Counts mark queues that need action. */
export function SidebarNav({ myOverdue, office = [], waiting = 0 }: { myOverdue: number; office?: OfficeLink[]; waiting?: number }) {
  const pathname = usePathname();
  const items = [...ITEMS, ...office.map((k) => OFFICE[k])];
  return (
    <nav aria-label="Main" className="flex flex-col gap-1.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        const count =
          href === "/tasks" && myOverdue > 0
            ? { n: myOverdue, label: `${myOverdue} overdue` }
            : href === "/purchasing" && waiting > 0
              ? { n: waiting, label: `${waiting} requests waiting for approval` }
              : null;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group flex h-12 items-center gap-3 rounded-lg px-3.5 font-medium transition-colors ${
              active ? "bg-primary text-white" : "text-muted hover:bg-active hover:text-primary"
            }`}
          >
            <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {count ? (
              <span
                className={`num inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                  active ? "bg-white text-primary" : "bg-[#ffecec] text-negative"
                }`}
                aria-label={count.label}
              >
                {count.n}
              </span>
            ) : null}
            <ChevronRight
              size={16}
              strokeWidth={1.8}
              aria-hidden="true"
              className={`transition-transform group-hover:translate-x-0.5 ${active ? "text-white" : "text-[#9197b3]"}`}
            />
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
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(226,236,249,0.7)] md:hidden"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-16 flex-col items-center justify-center gap-1 text-xs ${active ? "font-semibold text-primary" : "text-muted"}`}
          >
            <span className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-active" : ""}`}>
              <Icon size={20} strokeWidth={active ? 2 : 1.6} aria-hidden="true" />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
