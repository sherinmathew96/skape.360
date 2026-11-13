import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Paperclip, Scale, Wallet } from "lucide-react";
import { deleteEntry } from "@/app/daybook-actions";
import { ConfirmButton } from "@/components/confirm-button";
import { EntryForm } from "@/components/entry-form";
import { StatGrid } from "@/components/stat-grid";
import type { SessionUser } from "@/lib/auth";
import { byDay, dayBook, monthRange, summarise } from "@/lib/daybook";
import { formatINR, formatINRShort } from "@/lib/money";
import { can } from "@/lib/permissions";

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * A day book: what came in and went out, day by day, for a project or the
 * office. The month's figures on top, a form to add a line, then each day
 * with its totals, and where the money went by category.
 */
export async function DayBookView({
  user,
  projectId,
  month,
  basePath,
  canWrite,
  today,
}: {
  user: SessionUser;
  projectId: string | null;
  month: string;
  basePath: string;
  canWrite: boolean;
  today: string;
}) {
  const { from, to } = monthRange(month);
  const entries = await dayBook(projectId, from, to);
  const sums = summarise(entries);
  const days = byDay(entries);
  const net = sums.inPaise - sums.outPaise;
  const thisMonth = today.slice(0, 7);
  const finance = can(user, "finance.manage");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">{monthFmt.format(new Date(`${from}T00:00:00Z`))}</h2>
        <div className="flex items-center gap-1">
          <Link href={`${basePath}?month=${shiftMonth(month, -1)}`} className="btn btn-secondary h-10 w-10 p-0" aria-label="Previous month">
            <ChevronLeft size={18} strokeWidth={1.8} aria-hidden="true" />
          </Link>
          {month !== thisMonth ? (
            <Link href={basePath} className="btn btn-secondary h-10">This month</Link>
          ) : null}
          <Link
            href={`${basePath}?month=${shiftMonth(month, 1)}`}
            className={`btn btn-secondary h-10 w-10 p-0 ${month >= thisMonth ? "pointer-events-none opacity-40" : ""}`}
            aria-label="Next month"
            aria-disabled={month >= thisMonth}
          >
            <ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <StatGrid
        className="mb-6"
        stats={[
          { label: "Money in", value: formatINRShort(sums.inPaise), note: "this month", icon: ArrowDownLeft },
          { label: "Money out", value: formatINRShort(sums.outPaise), note: "this month", icon: ArrowUpRight, bad: sums.outPaise > 0 && net < 0 },
          { label: "Net", value: formatINRShort(net), note: net < 0 ? "more out than in" : "in minus out", icon: Scale, bad: net < 0 },
          { label: "Entries", value: entries.length, note: `${days.length} ${days.length === 1 ? "day" : "days"} with entries`, icon: Wallet },
        ]}
      />

      <div className={`grid grid-cols-1 items-start gap-6 ${canWrite ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <div className="grid min-w-0 grid-cols-1 gap-6">
          {days.length === 0 ? (
            <section className="card p-6">
              <p className="empty">Nothing entered for this month yet.{canWrite ? " Add the first line on the right." : ""}</p>
            </section>
          ) : (
            days.map((d) => (
              <section key={d.date} className="card overflow-hidden" aria-labelledby={`day-${d.date}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pb-3 pt-5 md:px-6">
                  <h3 id={`day-${d.date}`} className="font-semibold">{dayFmt.format(new Date(`${d.date}T00:00:00Z`))}</h3>
                  <p className="num text-sm">
                    {d.inPaise ? <span className="font-medium text-positive">+{formatINR(d.inPaise)}</span> : null}
                    {d.inPaise && d.outPaise ? <span className="text-muted"> · </span> : null}
                    {d.outPaise ? <span className="font-medium text-negative">−{formatINR(d.outPaise)}</span> : null}
                  </p>
                </div>
                <ul>
                  {d.entries.map((e) => {
                    const mayDelete = e.source !== "payment" && (finance || e.recordedBy === user.id);
                    return (
                      <li key={`${e.source}-${e.id}`} className="flex items-center gap-3 border-t border-rule px-5 py-3 md:px-6">
                        <span
                          className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${e.direction === "in" ? "bg-[#e5f8f2] text-positive" : "bg-[#ffecec] text-negative"}`}
                          aria-label={e.direction === "in" ? "Money in" : "Money out"}
                        >
                          {e.direction === "in" ? <ArrowDownLeft size={16} strokeWidth={2} /> : <ArrowUpRight size={16} strokeWidth={2} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{e.description}</span>
                          <span className="block truncate text-xs text-muted">
                            {[e.category, e.method, e.recordedByName].filter(Boolean).join(" · ")}
                            {e.source === "payment" && e.invoiceId ? (
                              <>
                                {" · "}
                                <Link href={`/finance/invoices/${e.invoiceId}`} className="text-primary hover:underline">from Finance</Link>
                              </>
                            ) : null}
                          </span>
                        </span>
                        {e.receiptFileId ? (
                          <a href={`/api/files/${e.receiptFileId}`} target="_blank" rel="noreferrer" className="btn btn-quiet h-9 w-9 flex-none p-0 text-muted" aria-label="Open the receipt" title="Receipt">
                            <Paperclip size={16} strokeWidth={1.6} aria-hidden="true" />
                          </a>
                        ) : null}
                        <span className={`num flex-none text-right font-semibold ${e.direction === "in" ? "text-positive" : "text-negative"}`}>
                          {e.direction === "in" ? "+" : "−"}
                          {formatINR(e.paise)}
                        </span>
                        {mayDelete ? (
                          <form action={deleteEntry} className="flex-none">
                            <input type="hidden" name="source" value={e.source} />
                            <input type="hidden" name="id" value={e.id} />
                            <ConfirmButton message={`Delete “${e.description}”, ${formatINR(e.paise)}? This can't be undone.`}>Delete</ConfirmButton>
                          </form>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-6">
          {canWrite ? (
            <section className="card p-6" aria-labelledby="add-entry-title">
              <h2 id="add-entry-title" className="card-title mb-4">Add to the day book</h2>
              <EntryForm projectId={projectId} today={today} office={projectId === null} />
            </section>
          ) : null}

          {entries.length ? (
            <section className="card p-6" aria-labelledby="breakdown-title">
              <h2 id="breakdown-title" className="card-title mb-4">Where it went</h2>
              {[
                { title: "Money out", rows: sums.outByCategory, total: sums.outPaise, bar: "bg-negative" },
                { title: "Money in", rows: sums.inByCategory, total: sums.inPaise, bar: "bg-mint-ink" },
              ]
                .filter((g) => g.rows.length)
                .map((g) => (
                  <div key={g.title} className="mb-5 last:mb-0">
                    <p className="mb-2 text-sm font-semibold">{g.title}</p>
                    <ul className="space-y-3">
                      {g.rows.map((r) => (
                        <li key={r.label}>
                          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                            <span className="truncate">{r.label}</span>
                            <span className="num font-medium">{formatINR(r.paise)}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                            <div className={`h-full rounded-full ${g.bar}`} style={{ width: `${Math.max(2, (r.paise / g.total) * 100)}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
