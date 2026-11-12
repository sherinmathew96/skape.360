import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { saveBillingDetails } from "@/app/finance-actions";
import { ActionForm } from "@/components/action-form";
import { ExpenseList } from "@/components/expense-list";
import { ProjectHeader } from "@/components/project-header";
import { getDb, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { formatDate, formatDue, today } from "@/lib/dates";
import { projectMoney } from "@/lib/finance";
import { GST_STATES } from "@/lib/gst";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getBusinessSettings } from "@/lib/procurement";

export const metadata: Metadata = { title: "Project finance" };

/* The project's money question: how much have we billed and collected, and what has it cost? */
export default async function ProjectFinancePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "finance.view")) redirect("/");
  const found = await getProject(user, (await params).id);
  if (!found) notFound();
  const { project, milestones } = found;
  const manage = can(user.role, "finance.manage");
  const db = await getDb();
  const [money, [client], studio] = await Promise.all([
    projectMoney(project.id),
    db
      .select({ address: s.clients.address, email: s.clients.email, stateCode: s.clients.stateCode, gstin: s.clients.gstin })
      .from(s.clients)
      .innerJoin(s.projects, eq(s.projects.clientId, s.clients.id))
      .where(eq(s.projects.id, project.id)),
    getBusinessSettings(),
  ]);
  const t = today();
  const overdue = money.invoices.filter((i) => i.status === "issued" && i.outstanding > 0 && i.dueDate && i.dueDate < t);
  const margin = money.received - money.costs;
  const unbilledMilestones = milestones.filter((m) => m.doneAt && !money.invoices.some((i) => i.milestoneId === m.id && i.status !== "cancelled"));

  const finding = overdue.length
    ? `${formatINR(overdue.reduce((n, i) => n + i.outstanding, 0))} is overdue from ${project.clientName}.`
    : unbilledMilestones.length
      ? `${unbilledMilestones.length} reached ${unbilledMilestones.length === 1 ? "milestone hasn't" : "milestones haven't"} been invoiced.`
      : money.outstanding
        ? `${formatINR(money.outstanding)} invoiced and not yet paid; nothing overdue.`
        : "Nothing is owed to the studio on this project.";

  const kpis: [string, string, string?][] = [
    ["Fee agreed", money.fee !== null ? formatINR(money.fee) : "–", money.fee !== null ? `${Math.round((money.invoicedFee / Math.max(money.fee, 1)) * 100)}% invoiced` : "Not set yet"],
    ["Received", formatINR(money.received), `of ${formatINR(money.invoiced)} invoiced`],
    ["Owed by client", formatINR(money.outstanding), overdue.length ? `${overdue.length} overdue` : "none overdue"],
    ["Spent", formatINR(money.costs), `${formatINR(money.billsTotal)} bills, ${formatINR(money.expensesTotal)} expenses`],
  ];

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        subtitle={finding}
        actions={
          manage ? (
            <Link href={`/finance/invoices/new?project=${project.id}`} className="btn btn-primary">
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" /> New invoice
            </Link>
          ) : null
        }
      />

      <dl className="card mb-3 grid grid-cols-2 md:grid-cols-4">
        {kpis.map(([label, value, sub], i) => (
          <div key={label} className={`px-5 py-4 ${i % 2 === 1 ? "border-l border-rule" : ""} ${i >= 2 ? "border-t border-rule md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}>
            <dt className="text-muted">{label}</dt>
            <dd className={`num mt-1 truncate text-xl leading-8 md:text-[26px] ${label === "Owed by client" && overdue.length ? "text-negative" : ""}`}>{value}</dd>
            {sub ? <dd className="num truncate text-xs text-muted">{sub}</dd> : null}
          </div>
        ))}
      </dl>
      <p className="num mb-3 px-1 text-muted">
        Received minus spent: <span className={margin < 0 ? "font-medium text-negative" : "font-medium text-text"}>{formatINR(margin)}</span>
        {money.unbilledOrders > 0 ? ` · ${formatINR(money.unbilledOrders)} more is ordered from suppliers and not yet billed` : ""}
        {money.billsUnpaid > 0 ? ` · ${formatINR(money.billsUnpaid)} of supplier bills still to pay` : ""}
      </p>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-1 gap-3">
          <section className="card" aria-labelledby="pf-inv-title">
            <h2 id="pf-inv-title" className="card-title px-5 pb-2 pt-4">Invoices</h2>
            {money.invoices.length === 0 ? (
              <p className="empty mx-5 mb-5 mt-2">No invoices yet.</p>
            ) : (
              <ul>
                {money.invoices.map((i) => {
                  const late = i.status === "issued" && i.outstanding > 0 && i.dueDate !== null && i.dueDate < t;
                  const state = i.status === "draft" ? "Draft" : i.status === "cancelled" ? "Cancelled" : i.outstanding === 0 ? "Paid" : late ? `Overdue, ${formatDue(i.dueDate!).toLowerCase()}` : `Due ${formatDate(i.dueDate!)}`;
                  return (
                    <li key={i.id} className="border-t border-rule first:border-t-0">
                      <Link href={`/finance/invoices/${i.id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-ground">
                        <div className="min-w-0 flex-1">
                          <p className="truncate">
                            <span className="mr-2 font-mono text-xs">{i.number ?? "Draft"}</span>
                            {i.items[0]?.description}
                          </p>
                          <p className={`text-xs leading-5 ${late ? "font-medium text-negative" : "text-muted"}`}>{state}</p>
                        </div>
                        <p className="num flex-none text-right text-xs leading-5 text-muted">
                          <span className={`block text-sm ${i.status === "cancelled" ? "text-muted line-through" : "text-text"}`}>{formatINR(i.totals.total)}</span>
                          {i.status === "issued" && i.outstanding > 0 && i.received + i.tds > 0 ? `${formatINR(i.outstanding)} due` : ""}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {manage && unbilledMilestones.length > 0 ? (
              <div className="border-t border-border bg-ground/60 px-5 py-3">
                <p className="mb-2 text-xs text-muted">Reached and not invoiced</p>
                <ul className="flex flex-wrap gap-2">
                  {unbilledMilestones.map((m) => (
                    <li key={m.id}>
                      <Link href={`/finance/invoices/new?project=${project.id}&milestone=${m.id}`} className="btn btn-secondary">Invoice: {m.name}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="card" aria-labelledby="pf-bills-title">
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
              <h2 id="pf-bills-title" className="card-title">Supplier bills</h2>
              {manage ? <Link href="/finance/bills/new" className="text-muted hover:text-text hover:underline">Enter a bill</Link> : null}
            </div>
            {money.bills.length === 0 ? (
              <p className="empty mx-5 mb-5 mt-2">No supplier bills yet.</p>
            ) : (
              <ul>
                {money.bills.map((b) => (
                  <li key={b.id} className="border-t border-rule first:border-t-0">
                    <Link href={`/finance/bills/${b.id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-ground">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{b.supplierName}</p>
                        <p className="truncate text-xs leading-5 text-muted">
                          Bill {b.billNumber} · {formatDate(b.billDate)}
                          {b.poNumber ? ` · ${b.poNumber}` : ""}
                        </p>
                      </div>
                      <p className="num flex-none text-right text-xs leading-5 text-muted">
                        <span className={`block text-sm ${b.cancelled ? "line-through" : "text-text"}`}>{formatINR(b.total)}</span>
                        {b.cancelled ? "Cancelled" : b.balance === 0 ? "Paid" : `${formatINR(b.balance)} to pay`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="pf-exp-title">
            <h2 id="pf-exp-title" className="card-title px-5 pb-2 pt-4">Expenses</h2>
            {money.expenses.length === 0 ? (
              <p className="empty mx-5 mb-5 mt-2">No expenses yet. The site team logs them on the Site tab.</p>
            ) : (
              <ExpenseList expenses={money.expenses.slice(0, 15)} user={user} showProject={false} />
            )}
          </section>
        </div>

        <section className="card p-5" aria-labelledby="billing-title">
          <h2 id="billing-title" className="card-title mb-1">Billing details</h2>
          <p className="mb-4 text-muted">Used on every invoice for {project.clientName}.</p>
          {manage ? (
            <ActionForm action={saveBillingDetails} submitLabel="Save" pendingLabel="Saving…" primary={false} className="space-y-4">
              <input type="hidden" name="projectId" value={project.id} />
              <div>
                <label htmlFor="bd-fee" className="field-label">Professional fee, before GST (₹)</label>
                <input id="bd-fee" name="fee" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={money.fee !== null ? (money.fee / 100).toFixed(2) : ""} className="field num text-right" />
              </div>
              <div>
                <label htmlFor="bd-state" className="field-label">Client&rsquo;s state</label>
                <select id="bd-state" name="stateCode" defaultValue={client?.stateCode ?? studio.stateCode} className="field">
                  {GST_STATES.map(([code, name]) => (
                    <option key={code} value={code}>{code} {name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="bd-gstin" className="field-label">Client&rsquo;s GSTIN</label>
                <input id="bd-gstin" name="gstin" defaultValue={client?.gstin ?? ""} maxLength={15} spellCheck={false} aria-describedby="bd-gstin-help" className="field font-mono uppercase" />
                <p id="bd-gstin-help" className="mt-2 text-xs text-muted">Only for business clients. Leave empty for individuals.</p>
              </div>
              <div>
                <label htmlFor="bd-address" className="field-label">Billing address</label>
                <textarea id="bd-address" name="address" rows={3} defaultValue={client?.address ?? ""} className="field h-auto py-2" />
              </div>
              <div>
                <label htmlFor="bd-email" className="field-label">Billing email</label>
                <input id="bd-email" name="email" type="email" defaultValue={client?.email ?? ""} spellCheck={false} className="field" />
              </div>
            </ActionForm>
          ) : (
            <dl className="space-y-2">
              <div><dt className="text-xs text-muted">State</dt><dd>{GST_STATES.find(([c]) => c === client?.stateCode)?.[1] ?? "Not set"}</dd></div>
              <div><dt className="text-xs text-muted">GSTIN</dt><dd className="font-mono">{client?.gstin ?? "–"}</dd></div>
              <div><dt className="text-xs text-muted">Address</dt><dd className="whitespace-pre-line">{client?.address ?? "–"}</dd></div>
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}
