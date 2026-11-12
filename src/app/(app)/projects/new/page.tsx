import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createProject } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { requireUser } from "@/lib/auth";
import { listClients, listStaff } from "@/lib/data";
import { listFirms } from "@/lib/firms";
import { today } from "@/lib/dates";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { PROJECT_TYPE_LABEL, STAGE_TEMPLATES } from "@/lib/stages";
import { PROJECT_TYPES } from "@/db/schema";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const user = await requireUser();
  if (!can(user.role, "projects.create")) redirect("/projects");

  const [clients, staff, firms] = await Promise.all([listClients(), listStaff(), listFirms()]);
  const leads = staff.filter((p) => p.active);

  return (
    <div className="mx-auto max-w-[1136px]">
      <p className="mb-2 text-muted">
        <Link href="/projects" className="hover:text-text hover:underline">Projects</Link> / New
      </p>
      <h1 className="mb-6 text-2xl font-bold leading-8 tracking-[-0.01em]">New project</h1>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card p-5">
          <ActionForm action={createProject} submitLabel="Create project" pendingLabel="Creating…" className="space-y-4">
            <div>
              <label htmlFor="name" className="field-label">Project name</label>
              <input id="name" name="name" required autoComplete="off" className="field" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="type" className="field-label">Type</label>
                <select id="type" name="type" defaultValue="design" className="field">
                  {PROJECT_TYPES.map((type) => (
                    <option key={type} value={type}>{PROJECT_TYPE_LABEL[type]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="location" className="field-label">Location</label>
                <input id="location" name="location" autoComplete="off" className="field" />
              </div>
            </div>

            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="sr-only">Client</legend>
              <div>
                <label htmlFor="clientId" className="field-label">Client</label>
                <select id="clientId" name="clientId" defaultValue={clients.length > 0 ? clients[0].id : "new"} className="field">
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  <option value="new">New client (name it on the right)</option>
                </select>
              </div>
              <div>
                <label htmlFor="clientName" className="field-label">New client&rsquo;s name</label>
                <input id="clientName" name="clientName" autoComplete="off" aria-describedby="client-help" className="field" />
              </div>
              <div className="sm:col-start-2">
                <label htmlFor="clientPhone" className="field-label">New client&rsquo;s phone</label>
                <input id="clientPhone" name="clientPhone" type="tel" inputMode="tel" autoComplete="off" className="field" />
                <p id="client-help" className="mt-2 text-xs text-muted">Only used when Client is set to New client.</p>
              </div>
            </fieldset>

            <div>
              <label htmlFor="firmId" className="field-label">Done for a firm</label>
              <select id="firmId" name="firmId" defaultValue="" aria-describedby="firm-help" className="field">
                <option value="">No, a direct client</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <p id="firm-help" className="mt-2 text-xs text-muted">
                For a contractor or PMC you design for. The project then shows on the firm&rsquo;s own page.{" "}
                <Link href="/firms" className="font-medium text-primary hover:underline">Add a firm</Link>
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="leadId" className="field-label">Project lead</label>
                <select id="leadId" name="leadId" defaultValue={user.id} className="field">
                  {leads.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({ROLE_LABEL[p.role]})</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="startDate" className="field-label">Start date</label>
                <input id="startDate" name="startDate" type="date" defaultValue={today()} className="field" />
              </div>
              <div>
                <label htmlFor="dueDate" className="field-label">Completion date</label>
                <input id="dueDate" name="dueDate" type="date" className="field" />
              </div>
            </div>
          </ActionForm>
        </div>

        <aside className="card p-5" aria-labelledby="stages-help">
          <h2 id="stages-help" className="card-title mb-1">Stages each type starts with</h2>
          <p className="mb-4 text-muted">The project number is assigned when you create it.</p>
          <dl className="space-y-4">
            {PROJECT_TYPES.map((type) => (
              <div key={type}>
                <dt className="font-medium">{PROJECT_TYPE_LABEL[type]}</dt>
                <dd className="text-muted">{STAGE_TEMPLATES[type].join(" → ")}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}
