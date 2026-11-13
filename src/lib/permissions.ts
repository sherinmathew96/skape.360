/**
 * What a role can see and do. Each role (Team → Roles) holds a list of these
 * keys; the signed-in user carries their role's list, and `can` checks it.
 */
export type Permission =
  | "staff.manage" // add staff, change roles, deactivate, edit roles
  | "projects.create"
  | "projects.edit" // details, team, stages, milestones, firm
  | "projects.view_all" // see projects you are not a member of
  | "tasks.manage" // create, reassign and close tasks on any visible project
  | "studio.manage" // upload 3D models, build 360° tours, drawings
  | "share.manage" // create and revoke client links, embed codes, portals
  | "site.report" // write daily site reports, raise material requests, record deliveries
  | "procurement.manage" // suppliers, approve material requests, purchase orders
  | "procurement.prices" // see rates and totals on purchase orders
  | "finance.view" // money pages: fees, invoices, bills, margins
  | "finance.manage" // raise invoices, record payments and supplier bills
  | "expense.add"; // record an expense with its receipt

/** Every permission, grouped by the part of the app it opens, with words for the Roles page. */
export const PERMISSION_GROUPS: { page: string; items: { key: Permission; label: string; help: string }[] }[] = [
  {
    page: "Projects",
    items: [
      { key: "projects.view_all", label: "See every project", help: "Without this, people see only the projects they are on." },
      { key: "projects.create", label: "Create projects and firms", help: "New projects, and the Firms page." },
      { key: "projects.edit", label: "Edit projects", help: "Details, team, stages, milestones and firm." },
      { key: "tasks.manage", label: "Manage everyone's tasks", help: "Create, reassign and close any task." },
    ],
  },
  {
    page: "Design",
    items: [
      { key: "studio.manage", label: "Drawings, 3D models and 360° tours", help: "Upload, revise and issue." },
      { key: "share.manage", label: "Share with clients", help: "Client links, embed codes and portals." },
    ],
  },
  {
    page: "Site",
    items: [{ key: "site.report", label: "Site reports", help: "Daily reports, snags, material requests and deliveries." }],
  },
  {
    page: "Purchasing",
    items: [
      { key: "procurement.manage", label: "Purchasing and suppliers", help: "Approve requests, raise purchase orders, manage suppliers." },
      { key: "procurement.prices", label: "See prices", help: "Rates and totals on orders." },
    ],
  },
  {
    page: "Finance",
    items: [
      { key: "finance.view", label: "See finance", help: "Fees, invoices, bills and margins." },
      { key: "finance.manage", label: "Manage finance", help: "Raise invoices, record payments and supplier bills." },
      { key: "expense.add", label: "Add expenses", help: "Record an expense with its receipt." },
    ],
  },
  {
    page: "Team",
    items: [{ key: "staff.manage", label: "Manage the team and roles", help: "Add people, change their role, edit roles, settings." }],
  },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export const isPermission = (key: string): key is Permission => (ALL_PERMISSIONS as string[]).includes(key);

/** The Admin role always has everything, so the studio can never lock itself out. */
export const ADMIN_ROLE = "admin";

export function can(subject: { permissions: readonly string[] }, permission: Permission): boolean {
  return subject.permissions.includes(permission);
}
