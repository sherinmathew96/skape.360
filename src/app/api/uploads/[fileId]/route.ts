import { and, eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { getUser } from "@/lib/auth";
import { storageDriver, writeLocal } from "@/lib/storage";

/**
 * Receives an upload's bytes when files are stored on this computer.
 * With R2 configured the browser uploads to R2 directly and this is unused.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  if (storageDriver() !== "local") return new Response("Uploads go to R2", { status: 404 });

  const user = await getUser();
  if (!user) return new Response("Sign in first", { status: 401 });

  const { fileId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return new Response("Not found", { status: 404 });

  const db = await getDb();
  const [file] = await db
    .select()
    .from(s.files)
    .where(and(eq(s.files.id, fileId), eq(s.files.uploadedBy, user.id), eq(s.files.ready, false)));
  if (!file) return new Response("Not found", { status: 404 });
  if (!request.body) return new Response("Empty body", { status: 400 });

  try {
    const written = await writeLocal(file.storageKey, request.body as never, file.size);
    if (written !== file.size) return new Response("Upload was cut short", { status: 400 });
  } catch {
    return new Response("Upload failed", { status: 400 });
  }
  return new Response(null, { status: 204 });
}
