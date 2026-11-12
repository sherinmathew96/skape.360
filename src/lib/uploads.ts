import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import type { SessionUser } from "./auth";
import { storedSize } from "./storage";

/**
 * Step 2 of an upload: the file this user uploaded to this project, checked
 * complete in storage and marked ready. Throws when it is missing or partial.
 */
export async function claimUploadedFile(user: SessionUser, projectId: string | null, fileId: string) {
  const db = await getDb();
  const [file] = await db
    .select()
    .from(s.files)
    .where(and(eq(s.files.id, z.string().uuid().parse(fileId)), projectId ? eq(s.files.projectId, projectId) : isNull(s.files.projectId), eq(s.files.uploadedBy, user.id)));
  if (!file) throw new Error("That upload was not found.");
  if (!file.ready) {
    if ((await storedSize(file.storageKey)) !== file.size) throw new Error("The upload did not finish. Try again.");
    await db.update(s.files).set({ ready: true }).where(eq(s.files.id, file.id));
  }
  return file;
}
