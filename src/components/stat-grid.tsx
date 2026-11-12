import type { LucideIcon } from "lucide-react";

export type Stat = { label: string; value: string | number; note?: string | null; icon: LucideIcon; bad?: boolean };

/**
 * A row of figures in one card, each with its round mark: mint when all is
 * well, red when it needs attention. Two across on a phone, four on a wide screen.
 */
export function StatGrid({ stats, className = "" }: { stats: Stat[]; className?: string }) {
  const n = stats.length;
  const wide = n === 3 ? "lg:grid-cols-3" : "xl:grid-cols-4";
  return (
    <dl className={`card grid grid-cols-2 sm:px-2 ${wide} ${className}`}>
      {stats.map((s, i) => {
        // Borders between cells: left on the second column, top on the second row (until everything sits in one row).
        const left = i % 2 === 1 ? "border-l" : "";
        const top = i >= 2 ? (n === 3 ? "border-t lg:border-t-0" : "border-t xl:border-t-0") : "";
        const wideLeft = i === 2 ? (n === 3 ? "lg:border-l" : "xl:border-l") : "";
        const spanLast = n === 3 && i === 2 ? "col-span-2 lg:col-span-1" : "";
        return (
          <div
            key={s.label}
            className={`flex min-w-0 flex-col items-start gap-3 border-rule px-4 py-5 sm:flex-row sm:items-center sm:gap-5 sm:px-5 sm:py-6 ${left} ${top} ${wideLeft} ${spanLast}`}
          >
            <span
              className={`flex h-12 w-12 flex-none items-center justify-center rounded-full sm:h-[72px] sm:w-[72px] ${s.bad ? "bg-[#ffecec] text-negative" : "bg-mint text-mint-ink"}`}
              aria-hidden="true"
            >
              <s.icon strokeWidth={1.6} className="h-6 w-6 sm:h-[30px] sm:w-[30px]" />
            </span>
            <div className="min-w-0">
              <dt className="text-sm text-muted">{s.label}</dt>
              <dd className={`num truncate text-[26px] font-semibold leading-9 tracking-[-0.02em] sm:text-[30px] sm:leading-10 ${s.bad ? "text-negative" : ""}`}>{s.value}</dd>
              {s.note ? <dd className={`truncate text-xs ${s.bad ? "font-medium text-negative" : "text-muted"}`}>{s.note}</dd> : null}
            </div>
          </div>
        );
      })}
    </dl>
  );
}
