import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PoForm } from "@/components/po-form";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { can } from "@/lib/permissions";
import { getPurchaseOrder, listSuppliers } from "@/lib/procurement";

export const metadata: Metadata = { title: "Edit purchase order" };

export default async function EditPoPage({ params }: { params: Promise<{ poId: string }> }) {
  const user = await requireUser();
  if (!can(user, "procurement.manage")) redirect("/purchasing");
  const found = await getPurchaseOrder((await params).poId);
  if (!found || !(await visibleProject(user, found.po.projectId))) notFound();
  const { po, items } = found;
  if (po.status !== "draft") redirect(`/purchasing/po/${po.id}`);
  const suppliers = (await listSuppliers({ activeOnly: true })).map((x) => ({ id: x.id, name: x.name, supplies: x.supplies }));
  // Keep the order's own supplier choosable even if it has since been marked not used.
  if (!suppliers.some((x) => x.id === po.supplierId)) suppliers.unshift({ id: po.supplierId, name: po.supplierName, supplies: null });

  return (
    <div className="mx-auto max-w-[1136px]">
      <p className="mb-2 text-muted">
        <Link href="/purchasing" className="hover:text-text hover:underline">Purchasing</Link> /{" "}
        <Link href={`/purchasing/po/${po.id}`} className="font-mono hover:text-text hover:underline">{po.number}</Link> / Edit
      </p>
      <h1 className="mb-6 text-2xl font-bold leading-8 tracking-[-0.01em]">Edit draft order</h1>
      <div className="card max-w-[760px] p-5">
        <PoForm
          poId={po.id}
          projects={[{ id: po.projectId, name: po.projectName, code: po.projectCode, location: po.projectLocation }]}
          projectId={po.projectId}
          suppliers={suppliers}
          initial={{
            supplierId: po.supplierId,
            expectedDate: po.expectedDate ?? "",
            deliveryAddress: po.deliveryAddress ?? "",
            notes: po.notes ?? "",
            lines: items.map((i) => ({ description: i.description, quantity: String(Number(i.quantity)), unit: i.unit, rate: String(Number(i.rate)), gstRate: String(Number(i.gstRate)) })),
          }}
        />
      </div>
    </div>
  );
}
