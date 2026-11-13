import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { ADMIN_ROLE, ALL_PERMISSIONS, isPermission, type Permission } from "./permissions";

export type RoleRow = { key: string; name: string; permissions: Permission[]; system: boolean; members: number };

/** Every role, built-in ones first, with how many people have it. */
export async function listRoles(): Promise<RoleRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      key: s.roles.key,
      name: s.roles.name,
      permissions: s.roles.permissions,
      system: s.roles.system,
      members: sql<number>`(select count(*) from ${s.users} u where u.role = "roles"."key" and u.active)::int`,
    })
    .from(s.roles)
    .orderBy(sql`${s.roles.system} desc`, asc(s.roles.name));
  return rows.map((r) => ({ ...r, permissions: r.key === ADMIN_ROLE ? ALL_PERMISSIONS : r.permissions.filter(isPermission) }));
}

export async function getRole(key: string): Promise<RoleRow | null> {
  return (await listRoles()).find((r) => r.key === key) ?? null;
}

/** Active people with this role, for the role's page. */
export async function roleMembers(key: string) {
  const db = await getDb();
  return db
    .select({ id: s.users.id, name: s.users.name, title: s.users.title, active: s.users.active })
    .from(s.users)
    .where(eq(s.users.role, key))
    .orderBy(asc(s.users.name));
}
