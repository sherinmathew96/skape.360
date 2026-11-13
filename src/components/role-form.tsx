import { createRole, updateRole } from "@/app/role-actions";
import { ActionForm } from "@/components/action-form";
import { PERMISSION_GROUPS, type Permission } from "@/lib/permissions";

/** A role's name and the access it gives, ticked page by page. */
export function RoleForm({ role, locked = false }: { role?: { key: string; name: string; permissions: Permission[] }; locked?: boolean }) {
  const has = new Set(role?.permissions ?? []);
  return (
    <ActionForm
      key={role?.key ?? "new"}
      action={role ? updateRole : createRole}
      submitLabel={role ? "Save role" : "Create role"}
      pendingLabel="Saving…"
      className="space-y-5"
    >
      {role ? <input type="hidden" name="key" value={role.key} /> : null}
      <div>
        <label htmlFor="role-name" className="field-label">Role name</label>
        <input
          id="role-name"
          name="name"
          required
          minLength={2}
          maxLength={60}
          defaultValue={role?.name ?? ""}
          disabled={locked}
          placeholder="e.g. Interior designer"
          autoComplete="off"
          className="field"
        />
      </div>

      <fieldset disabled={locked} className="space-y-4">
        <legend className="field-label">What they can access</legend>
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.page} className="rounded-xl border border-border bg-ground/60 p-4">
            <p className="mb-2 text-sm font-semibold">{group.page}</p>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.key}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface">
                    <input type="checkbox" name="permission" value={item.key} defaultChecked={has.has(item.key)} className="mt-0.5 h-4 w-4 flex-none" />
                    <span>
                      <span className="block font-medium">{item.label}</span>
                      <span className="block text-xs text-muted">{item.help}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-muted">Everyone can see the projects they are on, their tasks and the team list.</p>
      </fieldset>
    </ActionForm>
  );
}
