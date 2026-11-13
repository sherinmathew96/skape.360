import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PoForm } from "@/components/po-form";
import { getDb, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { listProjects } from "@/lib/data";
import { can } from "@/lib/permissions";
import { getRequest, listSuppliers, requestCode } from "@/lib/procurement";

export const metadata: Metadata = { title: "New purchase order" };

type Props = { searchParams: Promise<{ request?: string; project?: string }> };

export default async function NewPoPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!can(user, "procurement.manage")) redirect("/purchasing");
  const { request: requestId, project: projectParam } = await searchParams;

  const [projects, suppliers] = await Promise.all([listProjects(user), listSuppliers({ activeOnly: true })]);
  const open = projects.filter((p) => p.status === "active");

  // From an approved request: its project and items come across.
  let req = null;
  if (requestId && /^[0-9a-f-]{36}$/i.test(requestId)) {
    const db = await getDb();
    const [row] = await db.select({ projectId: s.materialRequests.projectId }).from(s.materialRequests).where(eq(s.materialRequests.id, requestId));
    req = row ? await getRequest(row.projectId, requestId) : null;
  }
  const projectId = req?.projectId ?? (open.some((p) => p.id === projectParam) ? projectParam : undefined);
  const location = projects.find((p) => p.id === projectId)?.location ?? null;

  return (
    <div className="mx-auto max-w-[1136px]">
      <p className="mb-2 text-muted">
        <Link href="/purchasing" className="hover:text-text hover:underline">Purchasing</Link> / New order
      </p>
      <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">New purchase order</h1>
      <p className="mb-6 mt-1 text-muted">
        {req ? `From ${requestCode(req.number)} on ${req.projectName}. Add rates, check quantities, then save.` : "Saved as a draft. Issue it when it's ready to send."}
      </p>

      {req && req.status !== "approved" ? (
        <p className="empty max-w-[760px]">That request is not waiting for an order any more.</p>
      ) : (
        <div className="card max-w-[760px] p-5">
          <PoForm
            projects={open.map((p) => ({ id: p.id, name: p.name, code: p.code, location: p.id === projectId ? location : p.location }))}
            projectId={projectId}
            requestId={req?.id}
            suppliers={suppliers}
            initial={{
              lines: req ? req.items.map((i) => ({ description: i.description, quantity: String(Number(i.quantity)), unit: i.unit, rate: "", gstRate: "18" })) : [],
              expectedDate: req?.neededBy ?? "",
            }}
          />
        </div>
      )}
    </div>
  );
}
