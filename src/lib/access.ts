import "server-only";
import { z } from "zod";
import { requireUser } from "./auth";
import { isProjectMember, visibleProject } from "./data";
import { can } from "./permissions";

/** Anyone on the project's team, or who manages projects. Throws otherwise. */
export async function requireProjectMember(projectId: string) {
  const user = await requireUser();
  const project = await visibleProject(user, z.string().uuid().parse(projectId));
  if (!project) throw new Error("That project was not found.");
  if (!can(user.role, "projects.edit") && !(await isProjectMember(user.id, project.id))) {
    throw new Error("Only the project's team can do that.");
  }
  return { user, project };
}
