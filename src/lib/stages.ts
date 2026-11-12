import type { ProjectType } from "@/db/schema";

const DESIGN = [
  "Concept",
  "Schematic",
  "Design development",
  "Working drawings",
  "Good for construction",
];

const CONSTRUCTION = [
  "Mobilisation",
  "Foundation",
  "Structure",
  "Finishes",
  "Handover",
];

/** The stage ladder a new project starts with, by project type. */
export const STAGE_TEMPLATES: Record<ProjectType, string[]> = {
  design: DESIGN,
  construction: CONSTRUCTION,
  design_build: [...DESIGN, "Construction", "Handover"],
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  design: "Design",
  construction: "Construction",
  design_build: "Design and build",
};
