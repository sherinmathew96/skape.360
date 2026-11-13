import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { RoleForm } from "@/components/role-form";
import { TeamTabs } from "@/components/team-tabs";
import { requireUser } from "@/lib/auth";
import { can, PERMISSION_GROUPS } from "@/lib/permissions";
import { listRoles } from "@/lib/roles";

export const metadata: Metadata = { title: "Roles and access" };

/** Every role with the parts of the app it opens, and a form for a new one. */
export default async function RolesPage() {
  const user = await requireUser();
  if (!can(user, "staff.manage")) redirect("/team");
  const roles = await listRoles();

  return (
    <div className="mx-auto max-w-[1136px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Team</h1>
        <p className="mt-1 text-muted">Roles decide what each person can see and do. Change a role and everyone with it changes too.</p>
      </div>
      <TeamTabs showRoles />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card overflow-hidden" aria-labelledby="roles-title">
          <h2 id="roles-title" className="card-title px-6 pb-3 pt-6">Roles</h2>
          <ul>
            {roles.map((r) => {
              const pages = PERMISSION_GROUPS.filter((g) => g.items.some((i) => r.permissions.includes(i.key))).map((g) => g.page);
              return (
                <li key={r.key} className="border-t border-rule">
                  <Link href={`/team/roles/${r.key}`} className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-[#fbfbff]">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-active text-primary" aria-hidden="true">
                      {r.key === "admin" ? <ShieldCheck size={20} strokeWidth={1.6} /> : <span className="text-sm font-semibold">{r.name.slice(0, 2).toUpperCase()}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        {r.name}
                        {r.system ? <Lock size={12} strokeWidth={1.8} className="text-muted" aria-label="Built in" /> : null}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {pages.length ? (
                          pages.map((p) => (
                            <span key={p} className="rounded-md bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">
                              {p}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted">Only their own projects and tasks</span>
                        )}
                      </span>
                    </span>
                    <span className="num hidden flex-none text-sm text-muted sm:block">
                      {r.members} {r.members === 1 ? "person" : "people"}
                    </span>
                    <ArrowRight size={16} strokeWidth={1.6} aria-hidden="true" className="flex-none text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card p-6" aria-labelledby="new-role-title">
          <h2 id="new-role-title" className="card-title mb-1">New role</h2>
          <p className="mb-5 text-muted">Name it, tick what it can open, then give it to people on the People tab.</p>
          <RoleForm />
        </section>
      </div>
    </div>
  );
}
