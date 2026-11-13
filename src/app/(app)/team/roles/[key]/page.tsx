import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { deleteRole } from "@/app/role-actions";
import { Avatar } from "@/components/avatar";
import { ConfirmButton } from "@/components/confirm-button";
import { RoleForm } from "@/components/role-form";
import { SettingsHeader } from "@/components/settings-header";
import { requireUser } from "@/lib/auth";
import { ADMIN_ROLE, can, PERMISSION_GROUPS } from "@/lib/permissions";
import { getRole, roleMembers } from "@/lib/roles";

export const metadata: Metadata = { title: "Role" };

export default async function RolePage({ params }: { params: Promise<{ key: string }> }) {
  const user = await requireUser();
  if (!can(user, "staff.manage")) redirect("/team");
  const role = await getRole(decodeURIComponent((await params).key));
  if (!role) notFound();
  const members = await roleMembers(role.key);
  const isAdmin = role.key === ADMIN_ROLE;

  return (
    <div className="mx-auto max-w-[1136px]">
      <SettingsHeader user={user} subtitle="Roles decide what each person can see and do." />
      <div className="mb-6">
        <p className="mb-1 text-sm text-muted">
          <Link href="/team/roles" className="hover:text-primary hover:underline">Roles</Link> / {role.name}
        </p>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">{role.name}</h2>
        <p className="mt-1 text-muted">
          {role.members} {role.members === 1 ? "person has" : "people have"} this role
          {role.system ? " · built in" : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card p-6" aria-labelledby="access-title">
          <h2 id="access-title" className="card-title mb-4">Access</h2>
          {isAdmin ? (
            <>
              <p className="mb-4 text-muted">Admin always has full access, so the studio can never lock itself out. Make a new role for anything narrower.</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {PERMISSION_GROUPS.flatMap((g) => g.items).map((i) => (
                  <li key={i.key} className="flex items-center gap-2 text-sm">
                    <Check size={16} strokeWidth={2} className="flex-none text-mint-ink" aria-hidden="true" />
                    {i.label}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <RoleForm role={role} />
          )}
        </section>

        <div className="grid grid-cols-1 gap-6">
          <section className="card overflow-hidden" aria-labelledby="people-title">
            <div className="flex items-baseline justify-between gap-4 px-6 pb-3 pt-6">
              <h2 id="people-title" className="card-title">People</h2>
              <Link href="/team" className="text-sm font-medium text-primary hover:underline">Change on People</Link>
            </div>
            {members.length === 0 ? (
              <p className="empty mx-6 mb-6">Nobody has this role yet. Give it to someone on the People tab.</p>
            ) : (
              <ul>
                {members.map((m) => (
                  <li key={m.id} className={`flex items-center gap-3 border-t border-rule px-6 py-3 ${m.active ? "" : "text-muted"}`}>
                    <Avatar name={m.name} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.name}</span>
                      <span className="block truncate text-xs text-muted">{m.active ? (m.title ?? "") : "Deactivated"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!role.system ? (
            <section className="card p-6" aria-labelledby="delete-title">
              <h2 id="delete-title" className="card-title mb-1">Delete role</h2>
              {members.length ? (
                <p className="text-muted">Move its {members.length === 1 ? "person" : `${members.length} people`} to another role on the People tab first.</p>
              ) : (
                <form action={deleteRole}>
                  <p className="mb-4 text-muted">Nobody has it, so it can go.</p>
                  <input type="hidden" name="key" value={role.key} />
                  <ConfirmButton message={`Delete the role “${role.name}”?`}>Delete role</ConfirmButton>
                </form>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
