"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  IndianRupee,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon };

/** The pages used every day: always in view. */
const MAIN: Item[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "My tasks", icon: ListChecks },
];

/** The phone's bottom bar: the everyday pages and Settings. */
const PHONE: Item[] = [...MAIN, { href: "/settings", label: "Settings", icon: Settings }];

/** Settings holds People, Roles and Firms too, so it lights up on those pages. */
const SETTINGS_PATHS = ["/settings", "/team", "/firms"];

/** Pages shown to the roles that use them, folded into sections. */
const OFFICE = {
  firms: { href: "/firms", label: "Firms", icon: Building2 },
  finance: { href: "/finance", label: "Finance", icon: IndianRupee },
  purchasing: { href: "/purchasing", label: "Purchasing", icon: ShoppingCart },
  suppliers: { href: "/suppliers", label: "Suppliers", icon: Truck },
  settings: { href: "/settings", label: "Settings", icon: Settings },
};
export type OfficeLink = keyof typeof OFFICE;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/settings") return SETTINGS_PATHS.some((p) => pathname.startsWith(p));
  return pathname.startsWith(href);
}

function Count({ n, label, onFill }: { n: number; label: string; onFill: boolean }) {
  return (
    <span
      className={`num inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${onFill ? "bg-white text-primary" : "bg-[#ffecec] text-negative"}`}
      aria-label={label}
    >
      {n}
    </span>
  );
}

/** One link. Main pages are tall; pages inside a section are a step smaller and set in. */
function NavLink({ item, pathname, count, nested = false }: { item: Item; pathname: string; count?: { n: number; label: string } | null; nested?: boolean }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-lg font-medium transition-colors ${nested ? "h-10 pl-11 pr-3.5 text-[13px]" : "h-12 px-3.5"} ${
        active ? "bg-primary text-white" : "text-muted hover:bg-active hover:text-primary"
      }`}
    >
      {nested ? null : <Icon size={20} strokeWidth={1.6} aria-hidden="true" />}
      <span className="flex-1">{item.label}</span>
      {count ? <Count n={count.n} label={count.label} onFill={active} /> : null}
      {nested ? null : (
        <ChevronRight
          size={16}
          strokeWidth={1.8}
          aria-hidden="true"
          className={`transition-transform group-hover:translate-x-0.5 ${active ? "text-white" : "text-[#9197b3]"}`}
        />
      )}
    </Link>
  );
}

// The open or closed state of each section, kept in this browser.
const NAV_EVENT = "skape-nav";
function subscribeNav(onChange: () => void) {
  window.addEventListener(NAV_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(NAV_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function readNav(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeNav(key: string, value: "open" | "closed") {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be blocked; the section still opens for this page view.
  }
  window.dispatchEvent(new Event(NAV_EVENT));
}

/** A section that folds: opens by itself on one of its pages and remembers if you left it open. */
function Section({
  id,
  label,
  icon: Icon,
  items,
  pathname,
  counts,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  items: Item[];
  pathname: string;
  counts: Record<string, { n: number; label: string } | null>;
}) {
  const here = items.some((i) => isActive(pathname, i.href));
  const key = `skape-nav-${id}`;
  // What you last chose for this section; until then it is open on its own pages.
  const saved = useSyncExternalStore(subscribeNav, () => readNav(key), () => null);
  const open = saved === null ? here : saved === "open";

  const waiting = items.reduce((n, i) => n + (counts[i.href]?.n ?? 0), 0);
  const listId = `nav-${id}`;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => writeNav(key, open ? "closed" : "open")}
        className={`group flex h-12 w-full items-center gap-3 rounded-lg px-3.5 text-left font-medium transition-colors hover:bg-active hover:text-primary ${here ? "text-primary" : "text-muted"}`}
      >
        <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
        <span className="flex-1">{label}</span>
        {!open && waiting > 0 ? <Count n={waiting} label={`${waiting} waiting in ${label}`} onFill={false} /> : null}
        <ChevronDown
          size={16}
          strokeWidth={1.8}
          aria-hidden="true"
          className={`text-[#9197b3] transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div id={listId} hidden={!open} className="mt-1 flex flex-col gap-1">
        {items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} count={counts[item.href]} nested />
        ))}
      </div>
    </div>
  );
}

/**
 * Desktop sidebar: the everyday pages, then folding sections for the pages
 * used now and then (people, office). Settings sits at the foot.
 */
export function SidebarNav({ myOverdue, office = [], waiting = 0 }: { myOverdue: number; office?: OfficeLink[]; waiting?: number }) {
  const pathname = usePathname();
  const counts: Record<string, { n: number; label: string } | null> = {
    "/tasks": myOverdue > 0 ? { n: myOverdue, label: `${myOverdue} overdue` } : null,
    "/purchasing": waiting > 0 ? { n: waiting, label: `${waiting} requests waiting for approval` } : null,
  };
  const work: Item[] = (["finance", "purchasing", "suppliers"] as const).filter((k) => office.includes(k)).map((k) => OFFICE[k]);

  return (
    <nav aria-label="Main" className="flex flex-col gap-1.5">
      {MAIN.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} count={counts[item.href]} />
      ))}
      <div className="my-2 h-px bg-rule" aria-hidden="true" />
      {work.length ? <Section id="office" label="Office" icon={Briefcase} items={work} pathname={pathname} counts={counts} /> : null}
    </nav>
  );
}

/** Settings, at the foot of the sidebar above the account: People, Roles, Firms, the recycle bin and more. */
export function SettingsLink() {
  const pathname = usePathname();
  const active = isActive(pathname, "/settings");
  return (
    <Link
      href="/settings"
      aria-current={active ? "page" : undefined}
      className={`mb-2 flex h-10 items-center gap-3 rounded-lg px-3.5 text-[13px] font-medium transition-colors ${
        active ? "bg-primary text-white" : "text-muted hover:bg-active hover:text-primary"
      }`}
    >
      <Settings size={18} strokeWidth={1.6} aria-hidden="true" />
      Settings
    </Link>
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
      {PHONE.map(({ href, label, icon: Icon }) => {
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
