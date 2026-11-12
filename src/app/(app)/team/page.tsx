import type { Metadata } from "next";
import { createStaff, updateStaff } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { ROLES } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listStaff } from "@/lib/data";
import { can, ROLE_LABEL } from "@/lib/permissions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const user = await requireUser();
  const staff = await listStaff();
  const manage = can(user.role, "staff.manage");
  const visible = manage ? staff : staff.filter((p) => p.active);
  const activeCount = staff.filter((p) => p.active).length;

  return (
    <div className="mx-auto max-w-[1136px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Team</h1>
        <p className="num mt-1 text-muted">
          {activeCount} {activeCount === 1 ? "person" : "people"} can sign in
          {manage && staff.length > activeCount ? `, ${staff.length - activeCount} deactivated` : ""}
        </p>
      </div>

      <div className={`grid grid-cols-1 items-start gap-3 ${manage ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <section className="card" aria-label="Staff">
          <ul>
            {visible.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule px-5 py-3 first:border-t-0"
              >
                <Avatar name={p.name} size={32} />
                <div className={`min-w-0 flex-1 basis-40 ${p.active ? "" : "text-muted"}`}>
                  <p className="truncate font-medium">
                    {p.name}
                    {p.id === user.id ? <span className="font-normal text-muted"> (you)</span> : null}
                  </p>
                  <p className="truncate text-xs leading-4 text-muted">
                    {[p.title, p.email].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="num w-28 flex-none text-right text-xs leading-4 text-muted">
                  <span className="block text-sm text-text">
                    {p.projects} {p.projects === 1 ? "project" : "projects"}
                  </span>
                  {p.openTasks} open {p.openTasks === 1 ? "task" : "tasks"}
                </p>

                {manage && p.id !== user.id ? (
                  <form action={updateStaff} className="flex w-full items-center gap-2 sm:w-auto">
                    <input type="hidden" name="id" value={p.id} />
                    <label htmlFor={`role-${p.id}`} className="sr-only">Role for {p.name}</label>
                    <select id={`role-${p.id}`} name="role" defaultValue={p.role} className="field w-auto min-w-0 flex-1 sm:w-40 sm:flex-none">
                      {ROLES.map((role) => (
                        <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                      ))}
                    </select>
                    <label htmlFor={`active-${p.id}`} className="sr-only">Access for {p.name}</label>
                    <select id={`active-${p.id}`} name="active" defaultValue={p.active ? "1" : "0"} className="field w-auto flex-none">
                      <option value="1">Can sign in</option>
                      <option value="0">Deactivated</option>
                    </select>
                    <button type="submit" className="btn btn-secondary h-10 md:h-9">Save</button>
                  </form>
                ) : (
                  <span className="pill">{ROLE_LABEL[p.role]}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {manage ? (
          <section className="card p-5" aria-labelledby="add-title">
            <h2 id="add-title" className="card-title mb-1">Add a staff account</h2>
            <p className="mb-4 text-muted">Give them the starting password in person. They sign in with their email.</p>
            <ActionForm action={createStaff} submitLabel="Create account" pendingLabel="Creating…" className="space-y-4">
              <div>
                <label htmlFor="staff-name" className="field-label">Name</label>
                <input id="staff-name" name="name" required autoComplete="off" className="field" />
              </div>
              <div>
                <label htmlFor="staff-email" className="field-label">Email</label>
                <input id="staff-email" name="email" type="email" required autoComplete="off" spellCheck={false} className="field" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div>
                  <label htmlFor="staff-role" className="field-label">Role</label>
                  <select id="staff-role" name="role" defaultValue="architect" className="field">
                    {ROLES.map((role) => (
                      <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="staff-title" className="field-label">Job title</label>
                  <input id="staff-title" name="title" autoComplete="off" className="field" />
                </div>
              </div>
              <div>
                <label htmlFor="staff-password" className="field-label">Starting password</label>
                <input
                  id="staff-password"
                  name="password"
                  type="text"
                  required
                  minLength={10}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="staff-password-help"
                  className="field font-mono"
                />
                <p id="staff-password-help" className="mt-2 text-xs text-muted">At least 10 characters.</p>
              </div>
            </ActionForm>
          </section>
        ) : null}
      </div>
    </div>
  );
}
