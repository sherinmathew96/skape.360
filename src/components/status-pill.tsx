import type { ProjectStatus } from "@/db/schema";

const LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TONE: Record<ProjectStatus, string> = {
  active: "pill-positive",
  on_hold: "pill-warning",
  completed: "",
  cancelled: "pill-negative",
};

export function StatusPill({ status }: { status: ProjectStatus }) {
  return <span className={`pill ${TONE[status]}`}>{LABEL[status]}</span>;
}
