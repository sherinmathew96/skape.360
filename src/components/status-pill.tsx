import type { ProjectStatus } from "@/db/schema";

const LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TONE: Record<ProjectStatus, string> = {
  active: "",
  on_hold: "pill-warning",
  completed: "pill-positive",
  cancelled: "",
};

export function StatusPill({ status }: { status: ProjectStatus }) {
  return <span className={`pill ${TONE[status]}`}>{LABEL[status]}</span>;
}
