"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { INCOME_CATEGORIES, PAYMENT_METHODS } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isProjectMember, visibleProject } from "@/lib/data";
import { today } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { deleteStoredWithCopies } from "@/lib/storage";
import { claimUploadedFile } from "@/lib/uploads";

const uuid = z.string().uuid();

/**
 * Who may write in a book: the office's book is for finance staff; a
 * project's book for its team (with "Add expenses") or finance staff.
 */
async function requireBookWriter(projectId: string | null) {
  const user = await requireUser();
  if (!projectId) {
    if (!can(user, "finance.manage")) throw new Error("Only finance staff can write in the office day book.");
    return { user, projectId: null };
  }
  const project = await visibleProject(user, uuid.parse(projectId));
  if (!project) throw new Error("That project was not found.");
  const allowed = can(user, "finance.manage") || (can(user, "expense.add") && (await isProjectMember(user.id, project.id)));
  if (!allowed) throw new Error("Only the project's team or finance staff can write in this day book.");
  return { user, projectId: project.id };
}

/** Money received: a client's advance on site, a refund, scrap sold, office income. */
export async function addIncome(input: {
  projectId: string;
  category: string;
  receivedOn: string;
  amount: string;
  description: string;
  method: string;
  receiptFileId: string | null;
}): Promise<{ error?: string; ok?: string }> {
  const parsed = z
    .object({
      category: z.enum(INCOME_CATEGORIES, { message: "Choose a category." }),
      receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date."),
      amount: z.coerce.number({ message: "Enter the amount." }).positive("Enter the amount.").max(1e10),
      description: z.string().trim().min(3, "Say who paid and what for.").max(300),
      method: z.enum(PAYMENT_METHODS),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  if (v.receivedOn > today()) return { error: "The date can't be in the future." };
  let ctx;
  try {
    ctx = await requireBookWriter(input.projectId || null);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not allowed." };
  }
  const receipt = input.receiptFileId ? await claimUploadedFile(ctx.user, ctx.projectId, input.receiptFileId) : null;
  const db = await getDb();
  const [row] = await db
    .insert(s.incomes)
    .values({
      projectId: ctx.projectId,
      category: v.category,
      receivedOn: v.receivedOn,
      amount: v.amount.toFixed(2),
      description: v.description,
      method: v.method,
      receiptFileId: receipt?.id ?? null,
      recordedBy: ctx.user.id,
    })
    .returning({ id: s.incomes.id });
  await db.insert(s.auditLog).values({ userId: ctx.user.id, action: "create", entity: "income", entityId: row.id, meta: { amount: v.amount } });
  revalidatePath(ctx.projectId ? `/projects/${ctx.projectId}/daybook` : "/daybook");
  return { ok: `₹${v.amount.toLocaleString("en-IN")} received, saved.` };
}

/** Removes a day-book entry: finance staff, or whoever entered it. */
export async function deleteEntry(formData: FormData) {
  const user = await requireUser();
  const source = z.enum(["income", "expense"]).parse(formData.get("source"));
  const id = uuid.parse(formData.get("id"));
  const db = await getDb();
  const table = source === "income" ? s.incomes : s.expenses;
  const [row] = await db
    .select({ id: table.id, projectId: table.projectId, recordedBy: table.recordedBy, receiptFileId: table.receiptFileId })
    .from(table)
    .where(eq(table.id, id));
  if (!row) return;
  if (!can(user, "finance.manage") && row.recordedBy !== user.id) throw new Error("Only finance staff or whoever entered it can delete this.");
  await db.delete(table).where(eq(table.id, id));
  if (row.receiptFileId) {
    const [file] = await db.select({ key: s.files.storageKey }).from(s.files).where(eq(s.files.id, row.receiptFileId));
    await db.delete(s.files).where(eq(s.files.id, row.receiptFileId));
    if (file) await deleteStoredWithCopies(file.key);
  }
  await db.insert(s.auditLog).values({ userId: user.id, action: "delete", entity: source, entityId: id });
  revalidatePath(row.projectId ? `/projects/${row.projectId}/daybook` : "/daybook");
}
