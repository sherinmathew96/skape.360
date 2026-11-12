import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createRequest } from "@/app/procurement-actions";
import { ActionForm } from "@/components/action-form";
import { LineItems } from "@/components/line-items";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { formatDate, formatDue, today } from "@/lib/dates";
import { formatINR, formatQty, orderTotals } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listPurchaseOrders, listRequests, PO_LABEL, PO_PILL, REQUEST_LABEL, REQUEST_PILL, requestCode } from "@/lib/procurement";

export const metadata: Metadata = { title: "Materials" };

export default async function MaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const found = await getProject(user, (await params).id);
  if (!found) notFound();
  const { project, members } = found;
  const [requests, orders] = await Promise.all([listRequests({ projectId: project.id }), listPurchaseOrders({ projectId: project.id })]);

  const onTeam = members.some((m) => m.id === user.id);
  const canRequest = (onTeam || can(user.role, "projects.edit")) && (can(user.role, "site.report") || can(user.role, "procurement.manage"));
  const prices = can(user.role, "procurement.prices");
  const t = today();
  const waiting = requests.filter((r) => r.status === "requested").length;
  const due = orders.filter((o) => o.status === "issued" || o.status === "partly_received").length;

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        subtitle={`${waiting} ${waiting === 1 ? "request" : "requests"} waiting for approval, ${due} ${due === 1 ? "order" : "orders"} awaiting delivery`}
      />

      <div className={`grid grid-cols-1 items-start gap-3 ${canRequest ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <div className="grid grid-cols-1 gap-3">
          <section className="card" aria-labelledby="orders-title">
            <h2 id="orders-title" className="card-title px-5 pb-2 pt-4">Purchase orders</h2>
            {orders.length === 0 ? (
              <p className="empty mx-5 mb-5 mt-2">No orders yet. Approved requests become orders in Purchasing.</p>
            ) : (
              <ul>
                {orders.map((o) => {
                  const totals = orderTotals(o.items);
                  const lateDelivery = (o.status === "issued" || o.status === "partly_received") && o.expectedDate && o.expectedDate < t;
                  return (
                    <li key={o.id} className="border-t border-rule first:border-t-0">
                      <Link href={`/purchasing/po/${o.id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-ground">
                        <div className="min-w-0 flex-1">
                          <p className="truncate">
                            <span className="mr-2 font-mono text-xs">{o.number}</span>
                            <span className="font-medium">{o.supplierName}</span>
                          </p>
                          <p className="truncate text-xs leading-5 text-muted">
                            {o.items.map((i) => `${i.description} ${formatQty(i.quantity)} ${i.unit}`).join(", ")}
                          </p>
                          {o.expectedDate && (o.status === "issued" || o.status === "partly_received") ? (
                            <p className={`text-xs ${lateDelivery ? "font-medium text-negative" : "text-muted"}`}>Expected {formatDue(o.expectedDate).toLowerCase()}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-none flex-col items-end gap-1">
                          <span className={`pill ${PO_PILL[o.status]}`}>{PO_LABEL[o.status]}</span>
                          {prices ? <span className="num text-xs text-muted">{formatINR(totals.total)}</span> : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="requests-title">
            <h2 id="requests-title" className="card-title px-5 pb-2 pt-4">Material requests</h2>
            {requests.length === 0 ? (
              <p className="empty mx-5 mb-5 mt-2">No requests yet.{canRequest ? " Ask for material with the form." : ""}</p>
            ) : (
              <ul>
                {requests.map((r) => (
                  <li key={r.id} className="border-t border-rule first:border-t-0">
                    <Link href={`/projects/${project.id}/materials/${r.id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-ground">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          <span className="mr-2 font-mono text-xs">{requestCode(r.number)}</span>
                          {r.items.map((i) => `${i.description} ${formatQty(i.quantity)} ${i.unit}`).join(", ")}
                        </p>
                        <p className="text-xs leading-5 text-muted">
                          {[r.requestedByName, formatDate(r.createdAt.toISOString().slice(0, 10)), r.neededBy ? `needed ${formatDue(r.neededBy).toLowerCase()}` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className={`pill flex-none ${REQUEST_PILL[r.status]}`}>{REQUEST_LABEL[r.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {canRequest ? (
          <section className="card p-5" aria-labelledby="new-request-title">
            <h2 id="new-request-title" className="card-title mb-1">Request material</h2>
            <p className="mb-4 text-muted">Goes to the office for approval and ordering.</p>
            <ActionForm action={createRequest} submitLabel="Send request" pendingLabel="Sending…" className="space-y-4">
              <input type="hidden" name="projectId" value={project.id} />
              <LineItems initial={[]} />
              <div>
                <label htmlFor="neededBy" className="field-label">Needed on site by</label>
                <input id="neededBy" name="neededBy" type="date" min={t} className="field" />
              </div>
              <div>
                <label htmlFor="req-note" className="field-label">Note for the office</label>
                <textarea id="req-note" name="note" rows={2} className="field h-auto py-2" />
              </div>
            </ActionForm>
          </section>
        ) : null}
      </div>
    </div>
  );
}
