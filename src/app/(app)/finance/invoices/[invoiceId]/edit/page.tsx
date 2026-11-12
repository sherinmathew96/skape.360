import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InvoiceForm } from "@/components/invoice-form";
import { requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { getInvoice } from "@/lib/finance";
import { can } from "@/lib/permissions";
import { getBusinessSettings } from "@/lib/procurement";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "finance.manage")) redirect("/finance");
  const inv = await getInvoice((await params).invoiceId);
  if (!inv) notFound();
  if (inv.status !== "draft") redirect(`/finance/invoices/${inv.id}`);
  const found = await getProject(user, inv.projectId);
  if (!found) notFound();
  const studio = await getBusinessSettings();

  return (
    <div className="mx-auto max-w-[1136px]">
      <p className="mb-2 text-muted">
        <Link href={`/finance/invoices/${inv.id}`} className="hover:text-text hover:underline">Draft invoice</Link> / Edit
      </p>
      <h1 className="mb-6 text-2xl font-bold leading-8 tracking-[-0.01em]">Edit draft invoice</h1>
      <div className="card max-w-[820px] p-5">
        <InvoiceForm
          invoiceId={inv.id}
          projectId={inv.projectId}
          milestones={found.milestones.map((x) => ({ id: x.id, name: x.name, dueDate: x.dueDate, done: x.doneAt !== null }))}
          studioState={studio.stateCode}
          initial={{
            milestoneId: inv.milestoneId ?? undefined,
            placeOfSupply: inv.placeOfSupply,
            dueDate: inv.dueDate ?? "",
            notes: inv.notes ?? "",
            lines: inv.items.map((i) => ({
              description: i.description,
              sac: i.sac ?? "",
              quantity: String(Number(i.quantity)),
              unit: i.unit,
              rate: String(Number(i.rate)),
              gstRate: String(Number(i.gstRate)),
            })),
          }}
        />
      </div>
    </div>
  );
}
