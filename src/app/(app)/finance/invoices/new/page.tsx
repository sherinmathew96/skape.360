import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InvoiceForm } from "@/components/invoice-form";
import { requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { DEFAULT_SAC } from "@/lib/gst";
import { can } from "@/lib/permissions";
import { getBusinessSettings } from "@/lib/procurement";
import { getDb, schema as s } from "@/db";
import { eq } from "drizzle-orm";

export const metadata: Metadata = { title: "New invoice" };

type Props = { searchParams: Promise<{ project?: string; milestone?: string }> };

export default async function NewInvoicePage({ searchParams }: Props) {
  const user = await requireUser();
  if (!can(user, "finance.manage")) redirect("/finance");
  const { project: projectId, milestone } = await searchParams;
  const found = projectId ? await getProject(user, projectId) : null;
  if (!found) notFound();
  const { project, milestones } = found;

  const db = await getDb();
  const [[client], studio] = await Promise.all([
    db
      .select({ stateCode: s.clients.stateCode, gstin: s.clients.gstin })
      .from(s.clients)
      .innerJoin(s.projects, eq(s.projects.clientId, s.clients.id))
      .where(eq(s.projects.id, project.id)),
    getBusinessSettings(),
  ]);
  const m = milestones.find((x) => x.id === milestone);

  return (
    <div className="mx-auto max-w-[1136px]">
      <p className="mb-2 text-muted">
        <Link href={`/projects/${project.id}/finance`} className="hover:text-text hover:underline">{project.name}</Link> / New invoice
      </p>
      <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">New invoice</h1>
      <p className="mb-6 mt-1 text-muted">
        To {project.clientName}. Saved as a draft; it gets its number when you issue it.
        {!client?.stateCode ? " The client's state isn't set yet; add it under the project's Finance tab." : ""}
      </p>
      <div className="card max-w-[820px] p-5">
        <InvoiceForm
          projectId={project.id}
          milestones={milestones.map((x) => ({ id: x.id, name: x.name, dueDate: x.dueDate, done: x.doneAt !== null }))}
          studioState={studio.stateCode}
          initial={{
            milestoneId: m?.id,
            placeOfSupply: client?.stateCode ?? studio.stateCode,
            lines: m ? [{ description: `Professional fee: ${m.name}`, sac: DEFAULT_SAC, quantity: "1", unit: "nos", rate: "", gstRate: "18" }] : [],
          }}
        />
      </div>
    </div>
  );
}
