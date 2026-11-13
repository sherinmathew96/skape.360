import { X } from "lucide-react";
import { deleteExpense } from "@/app/finance-actions";
import type { SessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { CATEGORY_LABEL, listExpenses } from "@/lib/finance";
import { formatINR, toPaise } from "@/lib/money";
import { can } from "@/lib/permissions";

type Expense = Awaited<ReturnType<typeof listExpenses>>[number];

/** Expense rows with their receipt; removable by finance, or by whoever entered it that day. */
export function ExpenseList({ expenses, user, showProject = true }: { expenses: Expense[]; user: SessionUser; showProject?: boolean }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  return (
    <ul>
      {expenses.map((e) => {
        const removable = can(user, "finance.manage") || (e.recordedBy === user.id && e.createdAt.toISOString().slice(0, 10) === todayIso);
        return (
          <li key={e.id} className="flex items-center gap-3 border-t border-rule px-5 py-2.5 first:border-t-0">
            <div className="min-w-0 flex-1">
              <p className="truncate">{e.description}</p>
              <p className="truncate text-xs leading-5 text-muted">
                {[formatDate(e.spentOn), CATEGORY_LABEL[e.category], showProject ? (e.projectName ?? "Studio overhead") : null, e.recordedByName].filter(Boolean).join(" · ")}
                {e.receiptFileId ? (
                  <>
                    {" · "}
                    <a href={`/api/files/${e.receiptFileId}`} target="_blank" rel="noreferrer" className="underline">receipt</a>
                  </>
                ) : (
                  <span className="text-negative"> · no receipt</span>
                )}
              </p>
            </div>
            <span className="num flex-none">{formatINR(toPaise(e.amount))}</span>
            {removable ? (
              <form action={deleteExpense} className="flex-none">
                <input type="hidden" name="expenseId" value={e.id} />
                <button type="submit" aria-label={`Remove expense: ${e.description}`} title="Remove" className="btn btn-quiet h-9 w-9 p-0 text-muted hover:text-negative">
                  <X size={15} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
