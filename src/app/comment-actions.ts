"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { drawingShownToClient, notifyClient } from "@/lib/client-updates";
import { itemValues } from "@/lib/comments";
import { isProjectMember, visibleProject } from "@/lib/data";
import { can } from "@/lib/permissions";

const uuid = z.string().uuid();

/** Staff reply in a client thread on a drawing, model or render. The client sees it under their bell. */
export async function replyToClient(input: { projectId: string; kind: string; itemId: string; body: string }): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireUser();
    const project = await visibleProject(user, uuid.parse(input.projectId));
    if (!project) throw new Error("That project was not found.");
    if (!(can(user, "studio.manage") || can(user, "projects.edit") || (await isProjectMember(user.id, project.id)))) throw new Error("Only the project's team can reply.");
    const item = z.object({ kind: z.enum(["drawing", "model", "render"]), id: uuid }).parse({ kind: input.kind, id: input.itemId });
    const body = z.string().trim().min(1, "Write a reply.").max(2000).parse(input.body);
    const db = await getDb();

    // Where the client will find it, and which drawing it hangs on.
    let drawingId: string | null = null;
    let title = "";
    let href = "";
    let section: "drawings" | "models" = "drawings";
    if (item.kind === "drawing") {
      const [d] = await db.select({ id: s.drawings.id, title: s.drawings.title }).from(s.drawings).where(and(eq(s.drawings.id, item.id), eq(s.drawings.projectId, project.id), isNull(s.drawings.deletedAt)));
      if (!d) throw new Error("That drawing was not found.");
      [drawingId, title, href] = [d.id, d.title, `drawings?d=${d.id}&v=comments`];
    } else if (item.kind === "render") {
      const [r] = await db
        .select({ drawingId: s.drawingRenders.drawingId, title: s.drawings.title })
        .from(s.drawingRenders)
        .innerJoin(s.drawings, eq(s.drawings.id, s.drawingRenders.drawingId))
        .where(and(eq(s.drawingRenders.id, item.id), eq(s.drawingRenders.projectId, project.id)));
      if (!r) throw new Error("That render was not found.");
      [drawingId, title, href] = [r.drawingId, `a render of ${r.title}`, `drawings?d=${r.drawingId}&v=renders`];
    } else {
      const [m] = await db.select({ id: s.models3d.id, title: s.models3d.title }).from(s.models3d).where(and(eq(s.models3d.id, item.id), eq(s.models3d.projectId, project.id), isNull(s.models3d.deletedAt)));
      if (!m) throw new Error("That 3D model was not found.");
      const [link] = await db.select({ drawingId: s.drawingModels.drawingId }).from(s.drawingModels).where(eq(s.drawingModels.modelId, m.id)).limit(1);
      title = `the 3D model ${m.title}`;
      if (link) [drawingId, href] = [link.drawingId, `drawings?d=${link.drawingId}&v=model`];
      else [href, section] = [`3d#m-${m.id}`, "models"];
    }

    await db.insert(s.comments).values({ projectId: project.id, ...itemValues(item), author: "studio", authorName: user.name, userId: user.id, body });
    if (!drawingId || (await drawingShownToClient(drawingId))) {
      await notifyClient({ projectId: project.id, kind: "reply", title: `Studio Skape replied on ${title}`, href, section, drawingId });
    }
    revalidatePath(`/projects/${project.id}`, "layout");
    return { ok: true };
  } catch (err) {
    return { error: err instanceof z.ZodError ? (err.issues[0]?.message ?? "Check the reply.") : err instanceof Error ? err.message : "That didn't work." };
  }
}

/** Marks the studio inbox as read up to now for this person. */
export async function markInboxSeen() {
  const user = await requireUser();
  const db = await getDb();
  await db.update(s.users).set({ inboxSeenAt: new Date() }).where(eq(s.users.id, user.id));
}
