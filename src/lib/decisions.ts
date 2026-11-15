import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { Decision } from "@/db/schema";

/** The drawing's newest revision, if it has been issued to the client. */
export async function latestIssued(drawingId: string) {
  const db = await getDb();
  const [latest] = await db
    .select()
    .from(s.drawingRevisions)
    .where(eq(s.drawingRevisions.drawingId, drawingId))
    .orderBy(desc(s.drawingRevisions.rev))
    .limit(1);
  return latest && latest.status !== "draft" ? latest : null;
}

/**
 * Records the client's decision on a revision, whether staff typed it in or
 * the client gave it on their portal. Approval moves the drawing to
 * production; a change request moves it back to revision (unless completed).
 */
export async function recordApproval(input: {
  revisionId: string;
  drawingId: string;
  decision: Decision;
  name: string;
  comment: string | null;
  recordedBy?: string | null;
  portalId?: string | null;
}) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.insert(s.approvals).values({
      revisionId: input.revisionId,
      decision: input.decision,
      name: input.name,
      comment: input.comment,
      recordedBy: input.recordedBy ?? null,
      portalId: input.portalId ?? null,
    });
    await tx.update(s.drawingRevisions).set({ status: input.decision }).where(eq(s.drawingRevisions.id, input.revisionId));
  });
  await db
    .update(s.drawings)
    .set({ status: input.decision === "approved" ? "production" : "revision", statusChangedAt: sql`now()` })
    .where(and(eq(s.drawings.id, input.drawingId), sql`${s.drawings.status} <> 'completed'`));
}
