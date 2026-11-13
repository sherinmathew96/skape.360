import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BillForm } from "@/components/bill-form";
import { requireUser } from "@/lib/auth";
import { listProjects } from "@/lib/data";
import { today } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { listPurchaseOrders, listSuppliers } from "@/lib/procurement";

export const metadata: Metadata = { title: "New supplier bill" };

export default async function NewBillPage({ searchParams }: { searchParams: Promise<{ po?: string }> }) {
  const user = await requireUser();
  if (!can(user, "finance.manage")) redirect("/finance");
  const [projects, suppliers, orders] = await Promise.all([
    listProjects(user),
    listSuppliers(),
    listPurchaseOrders({ status: ["issued", "partly_received", "received"] }),
  ]);
  const visible = new Set(projects.map((p) => p.id));

  return (
    <div className="mx-auto max-w-[1136px]">
      <p className="mb-2 text-muted">
        <Link href="/finance" className="hover:text-text hover:underline">Finance</Link> / New supplier bill
      </p>
      <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Enter a supplier bill</h1>
      <p className="mb-6 mt-1 text-muted">Pick the purchase order it&rsquo;s for, and the bill is checked against what was delivered.</p>
      <div className="card max-w-[760px] p-5">
        <BillForm
          suppliers={suppliers.map((x) => ({ id: x.id, name: x.name }))}
          orders={orders.filter((o) => visible.has(o.projectId)).map((o) => ({ id: o.id, number: o.number, supplierId: o.supplierId, projectId: o.projectId, projectName: o.projectName }))}
          projects={projects.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name }))}
          initialPoId={(await searchParams).po}
          today={today()}
        />
      </div>
    </div>
  );
}
