import { Box, FileText, Image as ImageIcon, MessageSquare } from "lucide-react";
import { threadsFor, type CommentItem } from "@/lib/comments";
import { drawingVisuals } from "@/lib/visuals";
import { StudioThread } from "./comment-thread";

type Thread = { item: CommentItem; label: string; Icon: typeof FileText; fileId?: string };

/**
 * Client comments on a drawing, its renders and the 3D models shown with it
 * (or on one model), each thread with a reply box for the team.
 */
export async function StudioComments({ projectId, drawingId, modelId, canReply }: { projectId: string; drawingId?: string; modelId?: string; canReply: boolean }) {
  let threads: Thread[] = [];
  if (drawingId) {
    const visuals = (await drawingVisuals([drawingId])).get(drawingId)!;
    threads = [
      { item: { kind: "drawing", id: drawingId }, label: "The drawing", Icon: FileText },
      ...visuals.renders.map((r) => ({ item: { kind: "render" as const, id: r.id }, label: `Render · ${r.title}`, Icon: ImageIcon, fileId: r.fileId })),
      ...visuals.models.map((m) => ({ item: { kind: "model" as const, id: m.id }, label: `3D model · ${m.title}`, Icon: Box })),
    ];
  } else if (modelId) {
    threads = [{ item: { kind: "model", id: modelId }, label: "This 3D model", Icon: Box }];
  }
  const all = await threadsFor(threads.map((t) => t.item));
  const withComments = threads.filter((t) => (all.get(`${t.item.kind}:${t.item.id}`) ?? []).length > 0);
  const waiting = withComments.filter((t) => all.get(`${t.item.kind}:${t.item.id}`)!.at(-1)?.author === "client").length;

  return (
    <section id="comments" className="card scroll-mt-6 p-5" aria-labelledby="comments-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="comments-title" className="card-title flex items-center gap-2">
          <MessageSquare size={18} strokeWidth={1.7} aria-hidden="true" className="text-primary" />
          Client comments
        </h2>
        {waiting ? <span className="pill pill-warning">{waiting} waiting for a reply</span> : null}
      </div>
      {withComments.length === 0 ? (
        <p className="text-sm text-muted">No comments from the client yet. They can comment from their portal on the drawing, its renders and 3D models.</p>
      ) : (
        <div className="space-y-5">
          {withComments.map((t) => {
            const list = all.get(`${t.item.kind}:${t.item.id}`)!;
            return (
              <div key={`${t.item.kind}-${t.item.id}`}>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {t.fileId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${t.fileId}?w=320`} alt="" width={40} height={26} className="h-[26px] w-10 rounded object-cover" />
                  ) : (
                    <t.Icon size={16} strokeWidth={1.7} aria-hidden="true" className="text-muted" />
                  )}
                  {t.label}
                </p>
                <div className="rounded-md bg-ground p-3">
                  <StudioThread
                    projectId={projectId}
                    item={t.item}
                    canReply={canReply}
                    comments={list.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
