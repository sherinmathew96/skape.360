import type { DrawingStatus } from "@/db/schema";

/**
 * The status chip, in the colours of the studio's spreadsheet so the team
 * and clients recognise it: a pale tint, a solid dot and the words.
 */
export const STATUS_STYLE: Record<DrawingStatus, { label: string; dot: string; bg: string; ink: string }> = {
  design_discussion: { label: "Design discussion pending", dot: "#d9a400", bg: "#fff6d6", ink: "#6b4f00" },
  pending: { label: "Pending", dot: "#d2691e", bg: "#fdebdc", ink: "#7a3608" },
  revision: { label: "Revision", dot: "#e8916b", bg: "#fdeee6", ink: "#7d3517" },
  production: { label: "Production", dot: "#3b7d2e", bg: "#e2f0dc", ink: "#1f4a16" },
  on_hold: { label: "On hold", dot: "#2f55a4", bg: "#e3eaf7", ink: "#1d3770" },
  completed: { label: "Completed", dot: "#8cc278", bg: "#eef7e9", ink: "#2d5a1f" },
};

export const STATUS_ORDER: DrawingStatus[] = ["design_discussion", "pending", "revision", "production", "on_hold", "completed"];

export function StatusChip({ status, className = "" }: { status: DrawingStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex h-6 flex-none items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 text-xs font-medium ${className}`}
      style={{ background: s.bg, color: s.ink }}
    >
      <span className="h-2 w-2 flex-none rounded-full" style={{ background: s.dot }} aria-hidden="true" />
      {s.label}
    </span>
  );
}
