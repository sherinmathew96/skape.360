import type { Role } from "@/db/schema";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  project_manager: "Project manager",
  architect: "Architect",
  site_engineer: "Site engineer",
  accountant: "Accountant",
};

export type Permission =
  | "staff.manage" // add staff, change roles, deactivate
  | "projects.create"
  | "projects.edit" // details, team, stages, milestones
  | "projects.view_all" // see projects you are not a member of
  | "tasks.manage" // create, reassign and close tasks on any visible project
  | "studio.manage" // upload 3D models, build 360° tours
  | "share.manage" // create and revoke client links and embed codes
  | "site.report"; // write daily site reports

const MATRIX: Record<Role, Permission[]> = {
  admin: ["staff.manage", "projects.create", "projects.edit", "projects.view_all", "tasks.manage", "studio.manage", "share.manage", "site.report"],
  project_manager: ["projects.create", "projects.edit", "projects.view_all", "tasks.manage", "studio.manage", "share.manage", "site.report"],
  architect: ["studio.manage", "share.manage"],
  site_engineer: ["site.report"],
  accountant: ["projects.view_all"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}
