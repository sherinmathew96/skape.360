"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { requirePermission } from "@/lib/auth";
import { ADMIN_ROLE, isPermission } from "@/lib/permissions";
import { slugify } from "@/lib/portal";
import type { FormState } from "./actions";

const nameInput = z.string().trim().min(2, "Give the role a name.").max(60, "Keep the name under 60 characters.");

function readPermissions(formData: FormData) {
  return [...new Set(formData.getAll("permission").map(String).filter(isPermission))];
}

/** A new role, e.g. "Interior designer", with the access ticked on the form. */
export async function createRole(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("staff.manage");
  const name = nameInput.safeParse(formData.get("name"));
  if (!name.success) return { error: name.error.issues[0]?.message };
  const db = await getDb();

  const base = slugify(name.data) || "role";
  let key = base;
  for (let n = 2; ; n++) {
    const [taken] = await db.select({ key: s.roles.key }).from(s.roles).where(eq(s.roles.key, key));
    if (!taken) break;
    key = `${base}-${n}`;
  }
  const [clash] = await db.select({ key: s.roles.key }).from(s.roles).where(eq(s.roles.name, name.data));
  if (clash) return { error: `There is already a role called ${name.data}.` };

  await db.insert(s.roles).values({ key, name: name.data, permissions: readPermissions(formData) });
  await db.insert(s.auditLog).values({ userId: user.id, action: "create", entity: "role", meta: { key } });
  revalidatePath("/team", "layout");
  redirect(`/team/roles/${key}`);
}

export async function updateRole(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("staff.manage");
  const key = z.string().min(1).parse(formData.get("key"));
  if (key === ADMIN_ROLE) return { error: "Admin always has full access and can't be changed." };
  const name = nameInput.safeParse(formData.get("name"));
  if (!name.success) return { error: name.error.issues[0]?.message };
  const permissions = readPermissions(formData);
  // Nobody removes their own way back to this page.
  if (key === user.role && !permissions.includes("staff.manage")) {
    return { error: "This is your own role: keep “Manage the team and roles”, or ask an admin to change it." };
  }

  const db = await getDb();
  const [role] = await db.select().from(s.roles).where(eq(s.roles.key, key));
  if (!role) return { error: "That role was not found." };
  const [clash] = await db.select({ key: s.roles.key }).from(s.roles).where(eq(s.roles.name, name.data));
  if (clash && clash.key !== key) return { error: `There is already a role called ${name.data}.` };

  await db.update(s.roles).set({ name: name.data, permissions }).where(eq(s.roles.key, key));
  await db.insert(s.auditLog).values({ userId: user.id, action: "update", entity: "role", meta: { key, permissions } });
  revalidatePath("/", "layout");
  return { ok: "Saved. It applies the next time each person opens a page." };
}

export async function deleteRole(formData: FormData) {
  const user = await requirePermission("staff.manage");
  const key = z.string().min(1).parse(formData.get("key"));
  const db = await getDb();
  const [role] = await db.select().from(s.roles).where(eq(s.roles.key, key));
  if (!role || role.system) return;
  const [{ n }] = await db.select({ n: count() }).from(s.users).where(eq(s.users.role, key));
  if (n > 0) return; // The page asks for people to be moved first.
  await db.delete(s.roles).where(eq(s.roles.key, key));
  await db.insert(s.auditLog).values({ userId: user.id, action: "delete", entity: "role", meta: { key } });
  revalidatePath("/team", "layout");
  redirect("/team/roles");
}
