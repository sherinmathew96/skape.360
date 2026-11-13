import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateProject } from "@/app/actions";
import { deleteProject } from "@/app/trash-actions";
import { ActionForm } from "@/components/action-form";
import { ProjectHeader } from "@/components/project-header";
import { PROJECT_STATUSES } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getProject, listStaff } from "@/lib/data";
import { listFirms } from "@/lib/firms";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Edit project" };

const STATUS_LABEL: Record<(typeof PROJECT_STATUSES)[number], string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Change a project's details after it was created, or move it to the recycle bin. */
export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const found = await getProject(user, (await params).id);
  if (!found) notFound();
  if (!can(user, "projects.edit")) redirect(`/projects/${found.project.id}`);
  const { project } = found;
  const [staff, firms] = await Promise.all([listStaff(), listFirms()]);
  const leads = staff.filter((p) => p.active || p.id === project.leadId);

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader project={project} crumbs={[{ href: `/projects/${project.id}`, label: "Overview" }]} subtitle="Edit the project's details" />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card p-6" aria-labelledby="details-title">
          <h2 id="details-title" className="card-title mb-5">Project details</h2>
          <ActionForm action={updateProject} submitLabel="Save changes" pendingLabel="Saving…" className="space-y-5">
            <input type="hidden" name="projectId" value={project.id} />
            <div>
              <label htmlFor="name" className="field-label">Project name</label>
              <input id="name" name="name" required minLength={2} defaultValue={project.name} autoComplete="off" className="field" />
            </div>

            <fieldset className="rounded-xl border border-border bg-ground/60 p-4">
              <legend className="px-1 text-sm font-semibold">Client</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="clientName" className="field-label">Client&rsquo;s name</label>
                  <input id="clientName" name="clientName" required minLength={2} defaultValue={project.clientName} autoComplete="off" className="field" />
                </div>
                <div>
                  <label htmlFor="clientPhone" className="field-label">Phone</label>
                  <input id="clientPhone" name="clientPhone" type="tel" inputMode="tel" defaultValue={project.clientPhone ?? ""} autoComplete="off" className="field" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">This changes the client everywhere, including their other projects and invoices not yet issued.</p>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="location" className="field-label">Location</label>
                <input id="location" name="location" defaultValue={project.location ?? ""} autoComplete="off" className="field" />
              </div>
              <div>
                <label htmlFor="status" className="field-label">Status</label>
                <select id="status" name="status" defaultValue={project.status} className="field">
                  {PROJECT_STATUSES.map((st) => (
                    <option key={st} value={st}>{STATUS_LABEL[st]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="leadId" className="field-label">Project lead</label>
                <select id="leadId" name="leadId" defaultValue={project.leadId ?? user.id} className="field">
                  {leads.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.roleName})</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="startDate" className="field-label">Start date</label>
                <input id="startDate" name="startDate" type="date" defaultValue={project.startDate ?? ""} className="field" />
              </div>
              <div>
                <label htmlFor="dueDate" className="field-label">Completion date</label>
                <input id="dueDate" name="dueDate" type="date" defaultValue={project.dueDate ?? ""} className="field" />
              </div>
            </div>

            <div>
              <label htmlFor="firmId" className="field-label">Done for a firm</label>
              <select id="firmId" name="firmId" defaultValue={project.firmId ?? ""} className="field">
                <option value="">No, a direct client</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </ActionForm>
          <Link href={`/projects/${project.id}`} className="mt-4 inline-block text-sm text-muted hover:text-primary hover:underline">Cancel</Link>
        </section>

        <section className="card p-6" aria-labelledby="delete-title">
          <h2 id="delete-title" className="card-title mb-1">Delete project</h2>
          <p className="mb-4 text-muted">
            The project and everything in it go to the recycle bin in Settings, and can be restored from there. Projects with invoices or purchase orders can&rsquo;t be deleted.
          </p>
          <ActionForm action={deleteProject} submitLabel="Move to recycle bin" pendingLabel="Moving…" primary={false} className="space-y-3">
            <input type="hidden" name="projectId" value={project.id} />
            <div>
              <label htmlFor="confirm-name" className="field-label">
                Type <span className="font-semibold">{project.name}</span> to confirm
              </label>
              <input id="confirm-name" name="confirm" required autoComplete="off" spellCheck={false} className="field" />
            </div>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
