import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { Mark } from "@/components/mark";
import { BottomNav, SidebarNav } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { listOpenTasks } from "@/lib/data";
import { today } from "@/lib/dates";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { listRequests } from "@/lib/procurement";
import type { OfficeLink } from "@/components/nav";

/*
 * Shell: an open plane. The sidebar sits on the page ground behind one
 * hairline; there is no top bar on desktop. On a phone the sidebar folds
 * into a 48px top bar and a four-item bottom bar.
 *
 * Canvas grid at 1440: 240 sidebar + 32 gutter + 1136 content + 32 gutter.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const t = today();
  const mine = await listOpenTasks(user, { mine: true });
  const myOverdue = mine.filter((task) => task.dueDate && task.dueDate < t).length;

  const office: OfficeLink[] = [];
  if (can(user.role, "finance.view")) office.push("finance");
  const buyer = can(user.role, "procurement.manage");
  if (buyer || can(user.role, "procurement.prices")) office.push("purchasing");
  if (buyer) office.push("suppliers");
  if (can(user.role, "staff.manage")) office.push("settings");
  const waiting = buyer ? (await listRequests({ status: ["requested"] })).length : 0;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border px-3 py-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 rounded-md px-2.5 py-1">
          <Mark size={24} />
          <span>
            <span className="block text-sm font-medium leading-4">SKAPE360</span>
            <span className="block text-xs leading-4 text-muted">Studio Skape</span>
          </span>
        </Link>

        <SidebarNav myOverdue={myOverdue} office={office} waiting={waiting} />

        <div className="mt-auto flex items-center gap-2.5 px-2.5 pt-4">
          <Avatar name={user.name} size={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm leading-4">{user.name}</span>
            <span className="block truncate text-xs leading-4 text-muted">{ROLE_LABEL[user.role]}</span>
          </span>
          <form action={logout}>
            <button type="submit" aria-label="Sign out" title="Sign out" className="btn btn-quiet h-8 w-8 p-0 text-muted">
              <LogOut size={16} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </form>
        </div>
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2.5 border-b border-border bg-ground px-4 md:hidden">
        <Mark size={24} />
        <span className="flex-1 text-sm font-medium">SKAPE360</span>
        <span className="max-w-32 truncate text-xs text-muted">{user.name}</span>
        <form action={logout}>
          <button type="submit" aria-label="Sign out" className="btn btn-quiet h-11 w-11 p-0 text-muted">
            <LogOut size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </form>
      </header>

      <main id="main" className="min-w-0 px-4 pb-24 pt-5 md:px-8 md:pb-12 md:pt-8">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
