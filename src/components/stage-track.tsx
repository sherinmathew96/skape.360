import type { Stage } from "@/db/schema";

/** Where a project stands: "Schematic", "Complete" or "Not started". */
export function currentStage(stages: Stage[]) {
  const current = stages.find((s) => s.status === "in_progress");
  const approved = stages.filter((s) => s.status === "approved").length;
  return {
    name: current?.name ?? (approved === stages.length && approved > 0 ? "Complete" : "Not started"),
    approved,
    total: stages.length,
  };
}

/**
 * The project's stage ladder as one segmented bar: approved stages in ink,
 * the stage in progress in blueprint blue, the rest in grey.
 */
export function StageTrack({ stages, className = "" }: { stages: Stage[]; className?: string }) {
  const { name, approved, total } = currentStage(stages);
  return (
    <div
      role="img"
      aria-label={`${name}. ${approved} of ${total} stages approved.`}
      className={`flex h-1.5 gap-0.5 ${className}`}
    >
      {stages.map((stage) => (
        <span
          key={stage.id}
          className={`h-full flex-1 rounded-[1px] ${
            stage.status === "approved"
              ? "bg-primary"
              : stage.status === "in_progress"
                ? "bg-stage"
                : "bg-stage-pending"
          }`}
        />
      ))}
    </div>
  );
}
