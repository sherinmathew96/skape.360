import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import { logout } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { Mark } from "@/components/mark";
import { BottomNav, SettingsLink, SidebarNav } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { listOpenTasks } from "@/lib/data";
import { today } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { listRequests } from "@/lib/procurement";
import type { OfficeLink } from "@/components/nav";

/*
 * Shell: a white sidebar with the logo and tall links, the current page
 * filled violet; the content sits on a soft blue-white ground under a
 * greeting and a project search. On a phone the sidebar folds into a top
 * bar and a four-item bottom bar.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const t = today();
  const mine = await listOpenTasks(user, { mine: true });
  const myOverdue = mine.filter((task) => task.dueDate && task.dueDate < t).length;

  const office: OfficeLink[] = [];
  if (can(user, "projects.create")) office.push("firms");
  if (can(user, "finance.view")) office.push("finance");
  const buyer = can(user, "procurement.manage");
  if (buyer || can(user, "procurement.prices")) office.push("purchasing");
  if (buyer) office.push("suppliers");
  if (can(user, "staff.manage")) office.push("settings");
  const waiting = buyer ? (await listRequests({ status: ["requested"] })).length : 0;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[272px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-border bg-surface px-5 pb-5 pt-7 md:flex">
        <Link href="/" className="mb-10 flex items-center gap-3 rounded-lg px-2">
          <Mark size={36} />
          <span>
            <span className="block text-[22px] font-semibold leading-6 tracking-[-0.02em]">SKAPE360</span>
            <span className="block text-xs leading-4 text-muted">Studio Skape</span>
          </span>
        </Link>

        <SidebarNav myOverdue={myOverdue} office={office} waiting={waiting} />

        <div className="mt-auto pt-6">
          {office.includes("settings") ? <SettingsLink /> : null}
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-ground p-3">
          <Avatar name={user.name} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium leading-5">{user.name}</span>
            <span className="block truncate text-xs leading-4 text-muted">{user.roleName}</span>
          </span>
          <form action={logout}>
            <button type="submit" aria-label="Sign out" title="Sign out" className="btn btn-quiet h-10 w-10 p-0 text-muted">
              <LogOut size={18} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </form>
        </div>
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b border-border bg-surface px-4 md:hidden">
        <Mark size={28} />
        <span className="flex-1 text-base font-semibold tracking-[-0.01em]">SKAPE360</span>
        <span className="max-w-32 truncate text-xs text-muted">{user.name}</span>
        <form action={logout}>
          <button type="submit" aria-label="Sign out" className="btn btn-quiet h-11 w-11 p-0 text-muted">
            <LogOut size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </form>
      </header>

      <div className="min-w-0">
        {/* Desktop: a greeting and the project search, above every page. */}
        <div className="mx-auto hidden max-w-[1200px] items-center justify-between gap-6 px-8 pb-2 pt-8 md:flex lg:px-12">
          <p className="text-2xl font-medium tracking-[-0.01em]">Hello {user.name.split(" ")[0]},</p>
          <form action="/projects" role="search" className="relative w-full max-w-[260px]">
            <label htmlFor="global-search" className="sr-only">Search projects</label>
            <Search size={20} strokeWidth={1.6} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9197b3]" />
            <input id="global-search" name="q" type="search" placeholder="Search projects" autoComplete="off" className="field h-11 border-transparent bg-surface pl-11 shadow-[var(--lift)]" />
          </form>
        </div>
        <main id="main" className="mx-auto max-w-[1200px] px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-6 lg:px-12">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
