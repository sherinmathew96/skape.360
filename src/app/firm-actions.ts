"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, count, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { requirePermission } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { ensurePortal, loadFirm } from "@/lib/firms";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkSlug, firmCookieName, firmCookieValue, slugTaken } from "@/lib/portal";
import type { FormState } from "./actions";

const uuid = z.string().uuid();

const firmInput = z.object({
  name: z.string().trim().min(2, "Enter the firm's name.").max(120),
  slug: z.string().trim().toLowerCase(),
  contactName: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  email: z.union([z.string().trim().email("Enter a valid email, or leave it empty."), z.literal("")]),
  access: z.enum(["keep", "set", "none"]),
  passcode: z.string().trim().max(64),
});

function readFirm(formData: FormData) {
  return firmInput.safeParse({
    name: formData.get("name") ?? "",
    slug: formData.get("slug") ?? "",
    contactName: formData.get("contactName") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    access: formData.get("access") ?? "set",
    passcode: formData.get("passcode") ?? "",
  });
}

/** Adds a contractor or PMC the studio designs for, with its own page. */
export async function createFirm(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("projects.create");
  const parsed = readFirm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const slugError = checkSlug(v.slug);
  if (slugError) return { error: slugError };
  if (await slugTaken(v.slug)) return { error: `360.studioskape.in/${v.slug} is already used by a project or another firm.` };
  if (v.access === "set" && v.passcode.length < 4) return { error: "Set a passcode of at least 4 characters, or choose no passcode." };

  const db = await getDb();
  const [firm] = await db
    .insert(s.firms)
    .values({
      name: v.name,
      slug: v.slug,
      contactName: v.contactName || null,
      phone: v.phone || null,
      email: v.email || null,
      passcodeHash: v.access === "set" ? await hashPassword(v.passcode) : null,
      createdBy: user.id,
    })
    .returning({ id: s.firms.id });
  await db.insert(s.auditLog).values({ userId: user.id, action: "create", entity: "firm", entityId: firm.id, meta: { name: v.name } });
  revalidatePath("/firms");
  redirect(`/firms/${firm.id}`);
}

export async function updateFirm(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("projects.create");
  const firmId = uuid.parse(formData.get("firmId"));
  const parsed = readFirm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const slugError = checkSlug(v.slug);
  if (slugError) return { error: slugError };
  if (await slugTaken(v.slug, { firmId })) return { error: `360.studioskape.in/${v.slug} is already used by a project or another firm.` };

  const db = await getDb();
  const [firm] = await db.select().from(s.firms).where(eq(s.firms.id, firmId));
  if (!firm) return { error: "That firm was not found." };
  let passcodeHash = firm.passcodeHash;
  if (v.access === "set") {
    if (v.passcode.length < 4) return { error: "Set a passcode of at least 4 characters, or choose no passcode." };
    passcodeHash = await hashPassword(v.passcode);
  } else if (v.access === "none") passcodeHash = null;

  await db
    .update(s.firms)
    .set({
      name: v.name,
      slug: v.slug,
      contactName: v.contactName || null,
      phone: v.phone || null,
      email: v.email || null,
      enabled: formData.get("enabled") === "on",
      passcodeHash,
    })
    .where(eq(s.firms.id, firmId));
  await db.insert(s.auditLog).values({ userId: user.id, action: "update", entity: "firm", entityId: firmId });
  revalidatePath("/firms", "layout");
  revalidatePath(`/${firm.slug}`, "layout");
  revalidatePath(`/${v.slug}`, "layout");
  return { ok: "Saved." };
}

/** Links a project to a firm (or to none), so it shows on the firm's page. */
export async function setProjectFirm(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("projects.edit");
  const project = await visibleProject(user, uuid.parse(formData.get("projectId")));
  if (!project) return { error: "That project was not found." };
  const raw = String(formData.get("firmId") ?? "");
  const firmId = raw ? uuid.parse(raw) : null;
  const db = await getDb();
  if (firmId) {
    const [firm] = await db.select({ id: s.firms.id }).from(s.firms).where(eq(s.firms.id, firmId));
    if (!firm) return { error: "That firm was not found." };
  }
  await db.update(s.projects).set({ firmId }).where(eq(s.projects.id, project.id));
  if (firmId) await ensurePortal(project.id, user.id);
  await db.insert(s.auditLog).values({ userId: user.id, action: "set_firm", entity: "project", entityId: project.id, meta: { firmId } });
  revalidatePath(`/projects/${project.id}`, "layout");
  revalidatePath("/firms", "layout");
  revalidatePath("/projects");
  return { ok: firmId ? "Linked. It now shows on the firm's page." : "Removed from the firm." };
}

/** The firm enters its passcode; it then opens all its projects too. */
export async function unlockFirm(_: FormState, formData: FormData): Promise<FormState> {
  const slug = String(formData.get("slug") ?? "");
  const passcode = String(formData.get("passcode") ?? "");
  const { state, firm } = await loadFirm(slug);
  if (!firm || state !== "locked" || !firm.passcodeHash) return { error: "This page cannot be opened." };

  const db = await getDb();
  const key = `firm:${firm.id}`;
  const since = new Date(Date.now() - 15 * 60_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(s.loginAttempts)
    .where(and(eq(s.loginAttempts.email, key), gt(s.loginAttempts.createdAt, since)));
  if (n >= 8) return { error: "Too many tries. Wait 15 minutes, or ask Studio Skape for the passcode." };
  if (!(await verifyPassword(passcode.trim(), firm.passcodeHash))) {
    await db.insert(s.loginAttempts).values({ email: key });
    return { error: "That passcode is not right." };
  }
  // Path "/": the same cookie opens each project page the firm's cards link to.
  (await cookies()).set(firmCookieName(firm.id), firmCookieValue(firm.id, firm.slug, firm.passcodeHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect(`/${firm.slug}`);
}
