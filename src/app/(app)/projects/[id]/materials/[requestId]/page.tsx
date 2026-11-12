import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ShoppingCart, X } from "lucide-react";
import { decideRequest } from "@/app/procurement-actions";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { formatDate, formatDue } from "@/lib/dates";
import { formatQty } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getRequest, listPurchaseOrders, PO_LABEL, PO_PILL, REQUEST_LABEL, REQUEST_PILL, requestCode } from "@/lib/procurement";

export const metadata: Metadata = { title: "Material request" };

export default async function RequestPage({ params }: { params: Promise<{ id: string; requestId: string }> }) {
  const user = await requireUser();
  const { id, requestId } = await params;
  const project = await visibleProject(user, id);
  if (!project) notFound();
  const req = await getRequest(project.id, requestId);
  if (!req) notFound();
  const orders = (await listPurchaseOrders({ projectId: project.id })).filter((o) => o.requestId === req.id);
  const buyer = can(user.role, "procurement.manage");
  const code = requestCode(req.number);

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        crumbs={[{ href: `/projects/${project.id}/materials`, label: "Materials" }]}
        subtitle={`${code} · ${[req.requestedByName, formatDate(req.createdAt.toISOString().slice(0, 10))].filter(Boolean).join(", ")}`}
        badge={<span className={`pill ${REQUEST_PILL[req.status]}`}>{REQUEST_LABEL[req.status]}</span>}
        actions={
          buyer && req.status === "approved" ? (
            <Link href={`/purchasing/po/new?request=${req.id}`} className="btn btn-primary">
              <ShoppingCart size={16} strokeWidth={1.5} aria-hidden="true" /> Make purchase order
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card" aria-labelledby="items-title">
          <h2 id="items-title" className="card-title px-5 pb-2 pt-4">Items</h2>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="num">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {req.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.description}</td>
                  <td className="num whitespace-nowrap">
                    {formatQty(i.quantity)} <span className="text-muted">{i.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="grid grid-cols-1 gap-3 border-t border-rule px-5 py-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Needed on site by</dt>
              <dd>{req.neededBy ? `${formatDate(req.neededBy)} (${formatDue(req.neededBy).toLowerCase()})` : "No date given"}</dd>
            </div>
            {req.note ? (
              <div>
                <dt className="text-xs text-muted">Note</dt>
                <dd className="whitespace-pre-line">{req.note}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <div className="grid grid-cols-1 gap-3">
          {buyer && req.status === "requested" ? (
            <section className="card p-5" aria-labelledby="decide-title">
              <h2 id="decide-title" className="card-title mb-4">Approve {code}?</h2>
              <form action={decideRequest} className="space-y-4">
                <input type="hidden" name="requestId" value={req.id} />
                <div>
                  <label htmlFor="decision-note" className="field-label">Note to site</label>
                  <textarea id="decision-note" name="note" rows={2} className="field h-auto py-2" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" name="decision" value="approved" className="btn btn-primary">
                    <Check size={16} strokeWidth={1.5} aria-hidden="true" /> Approve
                  </button>
                  <button type="submit" name="decision" value="rejected" className="btn btn-secondary">
                    <X size={16} strokeWidth={1.5} aria-hidden="true" /> Reject
                  </button>
                </div>
              </form>
            </section>
          ) : req.decidedAt ? (
            <section className="card p-5" aria-labelledby="decision-title">
              <h2 id="decision-title" className="card-title mb-1">{req.status === "rejected" ? "Rejected" : "Approved"}</h2>
              <p className="text-muted">
                {[req.decidedByName, formatDate(req.decidedAt.toISOString().slice(0, 10))].filter(Boolean).join(", ")}
              </p>
              {req.decisionNote ? <p className="mt-2 whitespace-pre-line">{req.decisionNote}</p> : null}
            </section>
          ) : (
            <section className="card p-5">
              <p className="text-muted">Waiting for a project manager to approve it.</p>
            </section>
          )}

          {orders.length > 0 ? (
            <section className="card" aria-labelledby="req-orders-title">
              <h2 id="req-orders-title" className="card-title px-5 pb-2 pt-4">Orders</h2>
              <ul>
                {orders.map((o) => (
                  <li key={o.id} className="border-t border-rule first:border-t-0">
                    <Link href={`/purchasing/po/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ground">
                      <span className="min-w-0 truncate">
                        <span className="mr-2 font-mono text-xs">{o.number}</span>
                        {o.supplierName}
                      </span>
                      <span className={`pill ${PO_PILL[o.status]}`}>{PO_LABEL[o.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
