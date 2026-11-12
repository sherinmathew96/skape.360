import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, IndianRupee, PackageCheck, Plus, Truck } from "lucide-react";
import { StatGrid } from "@/components/stat-grid";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDue, today } from "@/lib/dates";
import { formatINR, formatQty, orderTotals } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listPurchaseOrders, listRequests, PO_LABEL, PO_PILL, requestCode } from "@/lib/procurement";
import { listProjects } from "@/lib/data";

export const metadata: Metadata = { title: "Purchasing" };

type Props = { searchParams: Promise<{ view?: string }> };

/* The office's question: what is waiting on us, and what is late from suppliers? */
export default async function PurchasingPage({ searchParams }: Props) {
  const user = await requireUser();
  const buyer = can(user.role, "procurement.manage");
  if (!buyer && !can(user.role, "procurement.prices")) redirect("/");

  const visible = new Set((await listProjects(user)).map((p) => p.id));
  const [allRequests, allOrders] = await Promise.all([
    listRequests({ status: ["requested", "approved"] }),
    listPurchaseOrders({}),
  ]);
  const requests = allRequests.filter((r) => visible.has(r.projectId));
  const orders = allOrders.filter((o) => visible.has(o.projectId));

  const t = today();
  const toApprove = requests.filter((r) => r.status === "requested");
  const toOrder = requests.filter((r) => r.status === "approved");
  const drafts = orders.filter((o) => o.status === "draft");
  const awaiting = orders.filter((o) => o.status === "issued" || o.status === "partly_received");
  const late = awaiting.filter((o) => o.expectedDate && o.expectedDate < t);
  const view = (await searchParams).view === "all" ? "all" : "open";
  const listed = view === "all" ? orders : [...drafts, ...awaiting];
  const openValue = awaiting.reduce((sum, o) => sum + orderTotals(o.items).total, 0);

  const finding =
    toApprove.length > 0
      ? `${toApprove.length} material ${toApprove.length === 1 ? "request is" : "requests are"} waiting for approval${late.length ? `; ${late.length} ${late.length === 1 ? "order is" : "orders are"} past the delivery date` : ""}.`
      : late.length > 0
        ? `${late.length} ${late.length === 1 ? "order is" : "orders are"} past the delivery date.`
        : "Nothing is waiting on the office.";

  return (
    <div className="mx-auto max-w-[1136px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Purchasing</h1>
          <p className="mt-1 text-muted">{finding}</p>
        </div>
        {buyer ? (
          <Link href="/purchasing/po/new" className="btn btn-primary">
            <Plus size={16} strokeWidth={1.5} aria-hidden="true" /> New order
          </Link>
        ) : null}
      </div>

      <StatGrid
        className="mb-6"
        stats={[
          { label: "To approve", value: toApprove.length, icon: ClipboardCheck, bad: toApprove.length > 0 },
          { label: "Approved, not ordered", value: toOrder.length, icon: PackageCheck },
          { label: "Awaiting delivery", value: awaiting.length, icon: Truck },
          { label: "Value awaiting delivery", value: formatINR(openValue), icon: IndianRupee },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="card" aria-labelledby="queue-title">
          <h2 id="queue-title" className="card-title px-5 pb-2 pt-4">Requests from site</h2>
          {requests.length === 0 ? (
            <p className="empty mx-5 mb-5 mt-2">No requests waiting.</p>
          ) : (
            <ul>
              {[...toApprove, ...toOrder].map((r) => (
                <li key={r.id} className="border-t border-rule first:border-t-0">
                  <Link href={`/projects/${r.projectId}/materials/${r.id}`} className="block px-5 py-3 transition-colors hover:bg-ground">
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">
                        <span className="mr-2 font-mono text-xs">{requestCode(r.number)}</span>
                        <span className="font-medium">{r.projectName}</span>
                      </span>
                      <span className={`flex-none text-xs ${r.status === "requested" ? "font-medium text-negative" : "text-muted"}`}>
                        {r.status === "requested" ? "Approve" : "Order"}
                      </span>
                    </p>
                    <p className="truncate text-xs leading-5 text-muted">
                      {r.items.map((i) => `${i.description} ${formatQty(i.quantity)} ${i.unit}`).join(", ")}
                    </p>
                    {r.neededBy ? (
                      <p className={`text-xs ${r.neededBy < t ? "font-medium text-negative" : "text-muted"}`}>Needed {formatDue(r.neededBy).toLowerCase()}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="po-list-title">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h2 id="po-list-title" className="card-title">Purchase orders</h2>
            <nav aria-label="Which orders" className="flex rounded-md bg-raised p-1">
              <Link href="/purchasing" aria-current={view === "open" ? "page" : undefined} className={`flex h-9 items-center rounded-[5px] px-3 md:h-7 ${view === "open" ? "bg-surface font-medium" : "text-muted hover:text-text"}`}>Open</Link>
              <Link href="/purchasing?view=all" aria-current={view === "all" ? "page" : undefined} className={`flex h-9 items-center rounded-[5px] px-3 md:h-7 ${view === "all" ? "bg-surface font-medium" : "text-muted hover:text-text"}`}>All</Link>
            </nav>
          </div>
          {listed.length === 0 ? (
            <p className="empty mx-5 mb-5 mt-2">{view === "open" ? "No open orders." : "No orders yet."}</p>
          ) : (
            <ul>
              {listed.map((o) => {
                const lateOrder = (o.status === "issued" || o.status === "partly_received") && o.expectedDate !== null && o.expectedDate < t;
                return (
                  <li key={o.id} className="border-t border-rule first:border-t-0">
                    <Link href={`/purchasing/po/${o.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-ground sm:grid-cols-[minmax(0,1fr)_auto_120px]">
                      <span className="min-w-0">
                        <span className="block truncate">
                          <span className="mr-2 font-mono text-xs">{o.number}</span>
                          <span className="font-medium">{o.supplierName}</span>
                        </span>
                        <span className="block truncate text-xs leading-5 text-muted">
                          {o.projectName}
                          {o.expectedDate && o.status !== "received" && o.status !== "cancelled" ? (
                            <span className={lateOrder ? "font-medium text-negative" : ""}> · due {formatDue(o.expectedDate).toLowerCase()}</span>
                          ) : o.issuedAt ? ` · issued ${formatDate(o.issuedAt.toISOString().slice(0, 10))}` : ""}
                        </span>
                      </span>
                      <span className={`pill justify-self-end ${PO_PILL[o.status]}`}>{PO_LABEL[o.status]}</span>
                      <span className="num col-span-2 text-right sm:col-span-1">{formatINR(orderTotals(o.items).total)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
