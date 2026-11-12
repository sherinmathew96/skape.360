import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Send } from "lucide-react";
import { deleteDrawing, issueRevision, recordDecision } from "@/app/drawing-actions";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { NewRevision } from "@/components/drawing-upload";
import { DrawingViewer } from "@/components/drawing-viewer";
import { ProjectHeader } from "@/components/project-header";
import { requireUser } from "@/lib/auth";
import { visibleProject } from "@/lib/data";
import { DISCIPLINE_LABEL, getDrawing, revLabel, STATUS_LABEL, STATUS_PILL } from "@/lib/drawings";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Drawing" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

type Props = { params: Promise<{ id: string; drawingId: string }>; searchParams: Promise<{ rev?: string }> };

export default async function DrawingPage({ params, searchParams }: Props) {
  const user = await requireUser();
  const { id, drawingId } = await params;
  const project = await visibleProject(user, id);
  if (!project) notFound();
  const found = await getDrawing(project.id, drawingId);
  if (!found) notFound();
  const { drawing, revisions, approvals } = found;

  const latest = revisions[0];
  const wanted = Number((await searchParams).rev);
  const shown = revisions.find((r) => r.rev === wanted) ?? latest;
  const manage = can(user.role, "studio.manage");
  const base = `/projects/${project.id}/drawings/${drawing.id}`;

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        crumbs={[{ href: `/projects/${project.id}/drawings`, label: "Drawings" }]}
        subtitle={`${drawing.number} · ${drawing.title} · ${DISCIPLINE_LABEL[drawing.discipline]}`}
        actions={
          manage && latest?.status === "draft" ? (
            <form action={issueRevision}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="drawingId" value={drawing.id} />
              <button type="submit" className="btn btn-primary">
                <Send size={16} strokeWidth={1.5} aria-hidden="true" />
                Issue {revLabel(latest.rev)} to client
              </button>
            </form>
          ) : null
        }
      />

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden" aria-labelledby="sheet-title">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pb-3 pt-4">
            <h2 id="sheet-title" className="card-title">
              <span className="font-mono">{drawing.number}</span> {revLabel(shown.rev)}
              {shown.id !== latest.id ? <span className="ml-2 text-sm font-normal text-muted">superseded</span> : null}
            </h2>
            <span className={`pill ${shown.id === latest.id ? STATUS_PILL[shown.status] : ""}`}>
              {shown.id === latest.id ? STATUS_LABEL[shown.status] : `Replaced by ${revLabel(latest.rev)}`}
            </span>
          </div>
          <DrawingViewer key={shown.fileId} src={`/api/files/${shown.fileId}`} contentType={shown.contentType} title={`${drawing.number} ${drawing.title} ${revLabel(shown.rev)}`} />
        </section>

        <div className="grid grid-cols-1 gap-3">
          {manage && latest.status === "issued" ? (
            <section className="card p-5" aria-labelledby="record-title">
              <h2 id="record-title" className="card-title mb-1">Record the client&rsquo;s decision</h2>
              <p className="mb-4 text-muted">
                For a decision given by phone or in a meeting. Clients can also decide from their link.
              </p>
              <ActionForm action={recordDecision} submitLabel="Record" pendingLabel="Saving…" primary={false} className="space-y-4">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="drawingId" value={drawing.id} />
                <fieldset>
                  <legend className="field-label">Decision on {revLabel(latest.rev)}</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <label className="flex min-h-10 items-center gap-2">
                      <input type="radio" name="decision" value="approved" defaultChecked className="h-4 w-4 accent-[#141414]" /> Approved
                    </label>
                    <label className="flex min-h-10 items-center gap-2">
                      <input type="radio" name="decision" value="changes_requested" className="h-4 w-4 accent-[#141414]" /> Changes requested
                    </label>
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="decision-name" className="field-label">Who decided</label>
                  <input id="decision-name" name="name" required autoComplete="off" className="field" />
                </div>
                <div>
                  <label htmlFor="decision-comment" className="field-label">Comments</label>
                  <textarea id="decision-comment" name="comment" rows={2} aria-describedby="comment-help" className="field h-auto py-2" />
                  <p id="comment-help" className="mt-2 text-xs text-muted">Needed when changes are requested.</p>
                </div>
              </ActionForm>
            </section>
          ) : null}

          <section className="card" aria-labelledby="history-title">
            <h2 id="history-title" className="card-title px-5 pb-2 pt-4">Revisions</h2>
            <ol>
              {revisions.map((r) => {
                const decisions = approvals.filter((a) => a.revisionId === r.id);
                const current = r.id === shown.id;
                return (
                  <li key={r.id} className={`border-t border-rule px-5 py-3 first:border-t-0 ${current ? "bg-active" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={r.id === latest.id ? base : `${base}?rev=${r.rev}`}
                        aria-current={current ? "true" : undefined}
                        className="min-w-0 hover:underline"
                      >
                        <span className="font-mono font-medium">{revLabel(r.rev)}</span>
                        <span className="ml-2 text-xs text-muted">
                          {dateFmt.format(r.createdAt)}
                          {r.createdByName ? ` · ${r.createdByName}` : ""}
                        </span>
                      </Link>
                      <span className={`pill ${r.id === latest.id ? STATUS_PILL[r.status] : ""}`}>
                        {r.id === latest.id ? STATUS_LABEL[r.status] : "Superseded"}
                      </span>
                    </div>
                    {r.note ? <p className="mt-1 text-muted">{r.note}</p> : null}
                    {decisions.map((a) => (
                      <p key={a.id} className="mt-2 border-l-2 border-control pl-3 text-xs leading-5">
                        <span className={a.decision === "approved" ? "font-medium text-positive" : "font-medium text-negative"}>
                          {a.decision === "approved" ? "Approved" : "Changes requested"}
                        </span>{" "}
                        by {a.name}, {dateFmt.format(a.createdAt)}
                        {a.via ? <span className="text-muted"> ({a.via})</span> : null}
                        {a.comment ? <span className="mt-0.5 block whitespace-pre-line text-text">{a.comment}</span> : null}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ol>
            {manage ? (
              <div className="border-t border-border bg-ground/60 p-5">
                <NewRevision projectId={project.id} drawingId={drawing.id} nextRev={latest.rev + 1} />
              </div>
            ) : null}
          </section>

          {manage ? (
            <section className="card p-5" aria-labelledby="delete-title">
              <h2 id="delete-title" className="card-title mb-1">Delete drawing</h2>
              <p className="mb-4 text-muted">Removes every revision and its approvals.</p>
              <form action={deleteDrawing}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={drawing.id} />
                <ConfirmButton message={`Delete ${drawing.number} and all ${revisions.length} revisions?`}>Delete drawing</ConfirmButton>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
