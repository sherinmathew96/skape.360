import { isPortalFile, loadPortal } from "@/lib/portal";
import { getReadyFile } from "@/lib/share";
import { serveFile } from "@/lib/storage";

/** A file for the project's portal, only if the portal shows it. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; fileId: string }> }) {
  const { slug, fileId } = await params;
  const { state, portal } = await loadPortal(slug);
  if (!portal) return new Response("Not found", { status: 404 });
  const file = await getReadyFile(fileId);
  if (!file) return new Response("Not found", { status: 404 });
  // Before the passcode, only the cover may be seen.
  if (state !== "ok" && portal.coverFileId !== file.id) return new Response("Not found", { status: 404 });
  if (!(await isPortalFile(portal, file.id))) return new Response("Not found", { status: 404 });
  return serveFile(file);
}
