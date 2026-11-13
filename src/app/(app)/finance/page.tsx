import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Download, HandCoins, Plus, ReceiptIndianRupee, Wallet } from "lucide-react";
import { StatGrid } from "@/components/stat-grid";
import { requireUser } from "@/lib/auth";
import { listProjects } from "@/lib/data";
import { addDays, formatDate, formatDue, today } from "@/lib/dates";
import { listBills, listExpenses, listInvoices } from "@/lib/finance";
import { financialYear } from "@/lib/gst";
import { formatINR, toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Finance" };

/* The office's money question: who owes us, who do we owe this week, and how is the month going? */
export default async function FinancePage() {
  const user = await requireUser();
  if (!can(user, "finance.view")) redirect("/");
  const manage = can(user, "finance.manage");
  const t = today();
  const weekEnd = addDays(t, 7);
  const monthStart = t.slice(0, 7) + "-01";

  const visible = new Set((await listProjects(user)).map((p) => p.id));
  const [allInvoices, allBills, allExpenses] = await Promise.all([listInvoices({ status: ["issued"] }), listBills({ open: true }), listExpenses({ from: monthStart, to: t })]);
  const invoices = allInvoices.filter((i) => visible.has(i.projectId));
  const unpaid = invoices.filter((i) => i.outstanding > 0).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const overdue = unpaid.filter((i) => i.dueDate && i.dueDate < t);
  const bills = allBills.filter((b) => !b.projectId || visible.has(b.projectId));
  const dueSoon = bills.filter((b) => !b.dueDate || b.dueDate <= weekEnd);
  const expenses = allExpenses.filter((e) => !e.projectId || visible.has(e.projectId));

  const receivable = unpaid.reduce((n, i) => n + i.outstanding, 0);
  const overdueTotal = overdue.reduce((n, i) => n + i.outstanding, 0);
  const payable = bills.reduce((n, b) => n + b.balance, 0);
  const payableWeek = dueSoon.reduce((n, b) => n + b.balance, 0);
  const monthSpend = expenses.reduce((n, e) => n + toPaise(e.amount), 0);

  const finding = overdue.length
    ? `${formatINR(overdueTotal)} is overdue from ${new Set(overdue.map((i) => i.clientName)).size} ${overdue.length === 1 ? "client" : "clients"}; ${formatINR(payableWeek)} of supplier bills is due within a week.`
    : `Nothing overdue from clients; ${formatINR(payableWeek)} of supplier bills is due within a week.`;
  const fy = financialYear(t);

  return (
    <div className="mx-auto max-w-[1136px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Finance</h1>
          <p className="mt-1 text-muted">{finding}</p>
        </div>
        {manage ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/finance/bills/new" className="btn btn-secondary">
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" /> Supplier bill
            </Link>
            <Link href="/finance/expenses" className="btn btn-secondary">Expenses</Link>
          </div>
        ) : (
          <Link href="/finance/expenses" className="btn btn-secondary">Expenses</Link>
        )}
      </div>

      <StatGrid
        className="mb-6"
        stats={[
          { label: "Clients owe", value: formatINR(receivable), note: `${unpaid.length} unpaid ${unpaid.length === 1 ? "invoice" : "invoices"}`, icon: HandCoins },
          { label: "Overdue", value: formatINR(overdueTotal), note: `${overdue.length} ${overdue.length === 1 ? "invoice" : "invoices"}`, icon: AlertTriangle, bad: overdue.length > 0 },
          { label: "We owe suppliers", value: formatINR(payable), note: `${formatINR(payableWeek)} due in 7 days`, icon: ReceiptIndianRupee },
          { label: "Expenses this month", value: formatINR(monthSpend), note: `${expenses.length} entries`, icon: Wallet },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <section className="card" aria-labelledby="recv-title">
          <h2 id="recv-title" className="card-title px-5 pb-2 pt-4">Waiting for payment</h2>
          {unpaid.length === 0 ? (
            <p className="empty mx-5 mb-5 mt-2">Every issued invoice is paid. Raise new ones from a project&rsquo;s Finance tab.</p>
          ) : (
            <ul>
              {unpaid.slice(0, 10).map((i) => {
                const late = i.dueDate !== null && i.dueDate < t;
                return (
                  <li key={i.id} className="border-t border-rule first:border-t-0">
                    <Link href={`/finance/invoices/${i.id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-ground">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          <span className="font-medium">{i.clientName}</span>
                          <span className="ml-2 font-mono text-xs text-muted">{i.number}</span>
                        </p>
                        <p className={`truncate text-xs leading-5 ${late ? "font-medium text-negative" : "text-muted"}`}>
                          {i.projectName} · {late ? formatDue(i.dueDate!).toLowerCase() : `due ${formatDate(i.dueDate!)}`}
                        </p>
                      </div>
                      <span className="num flex-none">{formatINR(i.outstanding)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="pay-out-title">
          <h2 id="pay-out-title" className="card-title px-5 pb-2 pt-4">Supplier bills to pay</h2>
          {bills.length === 0 ? (
            <p className="empty mx-5 mb-5 mt-2">No unpaid supplier bills.</p>
          ) : (
            <ul>
              {bills.slice(0, 10).map((b) => {
                const late = b.dueDate !== null && b.dueDate < t;
                return (
                  <li key={b.id} className="border-t border-rule first:border-t-0">
                    <Link href={`/finance/bills/${b.id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-ground">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{b.supplierName}</p>
                        <p className={`truncate text-xs leading-5 ${late ? "font-medium text-negative" : "text-muted"}`}>
                          {[b.projectName ?? "Studio overhead", `bill ${b.billNumber}`, b.dueDate ? (late ? formatDue(b.dueDate).toLowerCase() : `pay by ${formatDate(b.dueDate)}`) : "no due date"].join(" · ")}
                        </p>
                      </div>
                      <span className="num flex-none">{formatINR(b.balance)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-3 p-5" aria-labelledby="export-title">
        <h2 id="export-title" className="card-title mb-1">Export for your accountant</h2>
        <p className="mb-4 text-muted">Spreadsheet files (CSV) for financial year {fy}, ready to import into Tally or Excel.</p>
        <ul className="flex flex-wrap gap-2">
          {[
            ["invoices", "Sales invoices"],
            ["receipts", "Payments received"],
            ["bills", "Supplier bills"],
            ["payments", "Payments to suppliers"],
            ["expenses", "Expenses"],
          ].map(([type, label]) => (
            <li key={type}>
              <a href={`/finance/export?type=${type}&fy=${fy}`} className="btn btn-secondary" download>
                <Download size={16} strokeWidth={1.5} aria-hidden="true" /> {label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
