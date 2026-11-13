import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Role } from "@/db/schema";
import { ADMIN_ROLE, ALL_PERMISSIONS, can, isPermission, type Permission } from "./permissions";

const COOKIE = "skape_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** The role's name as the studio wrote it, e.g. "Interior designer" */
  roleName: string;
  /** What this role may do, read fresh on every request */
  permissions: Permission[];
  title: string | null;
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt });

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
  }
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Read once per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const [row] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      title: schema.users.title,
      roleName: schema.roles.name,
      rolePermissions: schema.roles.permissions,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .leftJoin(schema.roles, eq(schema.roles.key, schema.users.role))
    .where(
      and(
        eq(schema.sessions.id, hashToken(token)),
        gt(schema.sessions.expiresAt, new Date()),
        eq(schema.users.active, true),
      ),
    );
  if (!row) return null;
  const { rolePermissions, roleName, ...user } = row;
  return {
    ...user,
    roleName: roleName ?? user.role,
    // Admin always has everything; an unknown role has nothing.
    permissions: user.role === ADMIN_ROLE ? ALL_PERMISSIONS : (rolePermissions ?? []).filter(isPermission),
  };
});

/** For pages and actions that need a signed-in user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** For actions: throws when the signed-in user lacks the permission. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) {
    throw new Error("You do not have permission to do that.");
  }
  return user;
}
