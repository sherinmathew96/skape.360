import { getReadyFile, isSharedFile, loadShare } from "@/lib/share";
import { requestedWidth, serveFile } from "@/lib/storage";

/** A file for someone holding a share link, only if the link shares it. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  const { state, link } = await loadShare(token);
  if (state !== "ok" || !link) return new Response("Not found", { status: 404 });

  const file = await getReadyFile(fileId);
  if (!file || !(await isSharedFile(link.id, file.id))) return new Response("Not found", { status: 404 });
  return serveFile(file, { width: requestedWidth(req) });
}
