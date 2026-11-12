import { getUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { getReadyFile } from "@/lib/share";
import { serveFile } from "@/lib/storage";

/** A file for signed-in staff who can see its project. */
export async function GET(_: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Sign in first", { status: 401 });

  const file = await getReadyFile((await params).fileId);
  if (!file || !(await visibleProject(user, file.projectId))) {
    return new Response("Not found", { status: 404 });
  }
  return serveFile(file);
}
