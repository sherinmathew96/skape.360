"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, count, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { requirePermission } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkSlug, loadPortal, portalCookieName, portalCookieValue, slugTaken } from "@/lib/portal";
import { claimUploadedFile } from "@/lib/uploads";
import type { FormState } from "./actions";

const uuid = z.string().uuid();

/** Creates or updates the project's client portal. */
export async function savePortal(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("share.manage");
  const project = await visibleProject(user, uuid.parse(formData.get("projectId")));
  if (!project) return { error: "That project was not found." };

  const parsed = z
    .object({
      slug: z.string().trim().toLowerCase(),
      brief: z.string().trim().max(600, "Keep the description under 600 characters."),
      area: z.string().trim().max(60),
      access: z.enum(["keep", "set", "none"]),
      passcode: z.string().trim().max(64),
      cover: z.union([uuid, z.literal(""), z.literal("remove")]),
    })
    .safeParse({
      slug: formData.get("slug") ?? "",
      brief: formData.get("brief") ?? "",
      area: formData.get("area") ?? "",
      access: formData.get("access") ?? "keep",
      passcode: formData.get("passcode") ?? "",
      cover: formData.get("cover") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const slugError = checkSlug(v.slug);
  if (slugError) return { error: slugError };

  const db = await getDb();
  const [existing] = await db.select().from(s.clientPortals).where(eq(s.clientPortals.projectId, project.id));
  if (await slugTaken(v.slug, { portalId: existing?.id })) return { error: `360.studioskape.in/${v.slug} is already used by another project or firm.` };

  let passcodeHash = existing?.passcodeHash ?? null;
  if (v.access === "set" || (!existing && v.access === "keep")) {
    if (v.passcode.length < 4) return { error: "Set a passcode of at least 4 characters, or choose open access." };
    passcodeHash = await hashPassword(v.passcode);
  } else if (v.access === "none") {
    passcodeHash = null;
  }

  let coverFileId = existing?.coverFileId ?? null;
  if (v.cover === "remove") coverFileId = null;
  else if (v.cover) {
    const file = await claimUploadedFile(user, project.id, v.cover);
    if (!file.contentType.startsWith("image/")) return { error: "The cover must be a photo or render (JPG, PNG or WebP)." };
    coverFileId = file.id;
  }

  const values = {
    slug: v.slug,
    enabled: formData.get("enabled") === "on",
    passcodeHash,
    coverFileId,
    brief: v.brief || null,
    area: v.area || null,
    sections: {
      drawings: formData.get("drawings") === "on",
      models: formData.get("models") === "on",
      tours: formData.get("tours") === "on",
      site: formData.get("site") === "on",
    },
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(s.clientPortals).set(values).where(eq(s.clientPortals.id, existing.id));
    if (existing.slug !== v.slug) revalidatePath(`/${existing.slug}`, "layout");
  } else {
    await db.insert(s.clientPortals).values({ ...values, projectId: project.id, createdBy: user.id });
  }
  await db.insert(s.auditLog).values({ userId: user.id, action: existing ? "update" : "create", entity: "client_portal", entityId: project.id, meta: { slug: v.slug } });
  revalidatePath(`/projects/${project.id}/sharing`);
  revalidatePath(`/${v.slug}`, "layout");
  return { ok: existing ? "Saved." : "Portal created." };
}

/** The client enters the portal's passcode. */
export async function unlockPortal(_: FormState, formData: FormData): Promise<FormState> {
  const slug = String(formData.get("slug") ?? "");
  const passcode = String(formData.get("passcode") ?? "");
  const { state, portal } = await loadPortal(slug);
  if (!portal || state !== "locked" || !portal.passcodeHash) return { error: "This page cannot be opened." };

  const db = await getDb();
  const key = `portal:${portal.id}`;
  const since = new Date(Date.now() - 15 * 60_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(s.loginAttempts)
    .where(and(eq(s.loginAttempts.email, key), gt(s.loginAttempts.createdAt, since)));
  if (n >= 8) return { error: "Too many tries. Wait 15 minutes, or ask Studio Skape for the passcode." };

  if (!(await verifyPassword(passcode.trim(), portal.passcodeHash))) {
    await db.insert(s.loginAttempts).values({ email: key });
    return { error: "That passcode is not right." };
  }

  (await cookies()).set(portalCookieName(portal.id), portalCookieValue(portal.id, portal.slug, portal.passcodeHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/${portal.slug}`,
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect(`/${portal.slug}`);
}
