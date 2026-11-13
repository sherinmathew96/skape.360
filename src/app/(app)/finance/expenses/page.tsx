import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExpenseForm } from "@/components/expense-form";
import { ExpenseList } from "@/components/expense-list";
import { requireUser } from "@/lib/auth";
import { listProjects } from "@/lib/data";
import { today } from "@/lib/dates";
import { CATEGORY_LABEL, listExpenses } from "@/lib/finance";
import { formatINR, toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";
import type { ExpenseCategory } from "@/db/schema";

export const metadata: Metadata = { title: "Expenses" };

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

type Props = { searchParams: Promise<{ month?: string }> };

export default async function ExpensesPage({ searchParams }: Props) {
  const user = await requireUser();
  if (!can(user, "finance.view")) redirect("/");
  const t = today();
  const wanted = (await searchParams).month;
  const month = wanted && /^\d{4}-\d{2}$/.test(wanted) ? wanted : t.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

  const visible = (await listProjects(user)).filter((p) => p.status === "active");
  const ids = new Set(visible.map((p) => p.id));
  const expenses = (await listExpenses({ from, to })).filter((e) => !e.projectId || ids.has(e.projectId));
  const total = expenses.reduce((n, e) => n + toPaise(e.amount), 0);
  const overheads = expenses.filter((e) => !e.projectId).reduce((n, e) => n + toPaise(e.amount), 0);
  const noReceipt = expenses.filter((e) => !e.receiptFileId).length;
  const byCategory = Object.entries(
    expenses.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.category]: (acc[e.category] ?? 0) + toPaise(e.amount) }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const top = byCategory[0]?.[1] ?? 0;

  return (
    <div className="mx-auto max-w-[1136px]">
      <p className="mb-2 text-muted">
        <Link href="/finance" className="hover:text-text hover:underline">Finance</Link> / Expenses
      </p>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Expenses, {monthFmt.format(new Date(`${from}T00:00:00Z`))}</h1>
          <p className="num mt-1 text-muted">
            {formatINR(total)} across {expenses.length} {expenses.length === 1 ? "expense" : "expenses"}, {formatINR(overheads)} of it studio overheads
            {noReceipt ? <span className="text-negative">, {noReceipt} without a receipt</span> : null}
          </p>
        </div>
        <nav aria-label="Month" className="flex gap-1">
          <Link href={`/finance/expenses?month=${prev}`} className="btn btn-secondary">Previous month</Link>
          {month < t.slice(0, 7) ? <Link href={`/finance/expenses?month=${next}`} className="btn btn-secondary">Next month</Link> : null}
        </nav>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-1 gap-3">
          {byCategory.length > 0 ? (
            <section className="card px-5 pb-4 pt-4" aria-labelledby="cat-title">
              <h2 id="cat-title" className="card-title mb-3">By category</h2>
              <ul className="space-y-2">
                {byCategory.map(([cat, paise], i) => (
                  <li key={cat}>
                    <p className="flex justify-between gap-3">
                      <span>{CATEGORY_LABEL[cat as ExpenseCategory]}</span>
                      <span className="num">{formatINR(paise)}</span>
                    </p>
                    <div className="mt-1 h-0.5 bg-rule">
                      <div className={`h-full ${i === 0 ? "bg-primary" : "bg-control"}`} style={{ width: `${Math.max(2, (paise / top) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="card" aria-labelledby="exp-list-title">
            <h2 id="exp-list-title" className="card-title px-5 pb-2 pt-4">All expenses this month</h2>
            {expenses.length === 0 ? <p className="empty mx-5 mb-5 mt-2">No expenses recorded this month.</p> : <ExpenseList expenses={expenses} user={user} />}
          </section>
        </div>

        {can(user, "expense.add") ? (
          <section className="card p-5" aria-labelledby="add-exp-title">
            <h2 id="add-exp-title" className="card-title mb-4">Record an expense</h2>
            <ExpenseForm projects={visible.map((p) => ({ id: p.id, name: p.name }))} allowOverhead={can(user, "finance.manage")} today={t} defaultCategory="office" />
          </section>
        ) : null}
      </div>
    </div>
  );
}
