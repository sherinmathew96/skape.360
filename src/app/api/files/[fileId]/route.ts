import { getUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { can } from "@/lib/permissions";
import { getReadyFile } from "@/lib/share";
import { requestedWidth, serveFile } from "@/lib/storage";

/** A file for signed-in staff who can see its project. */
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Sign in first", { status: 401 });

  const file = await getReadyFile((await params).fileId);
  // Receipts and supplier bills show prices: finance staff and whoever uploaded them only.
  // Other files follow the project they belong to.
  const isReceipt = file?.storageKey.includes("/receipt/");
  const allowed =
    file &&
    (isReceipt
      ? can(user.role, "finance.view") || file.uploadedBy === user.id
      : file.projectId
        ? await visibleProject(user, file.projectId)
        : false);
  if (!file || !allowed) {
    return new Response("Not found", { status: 404 });
  }
  return serveFile(file, { width: requestedWidth(req) });
}
