import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Send } from "lucide-react";
import { deleteDrawing, issueRevision, recordDecision, updateDrawing } from "@/app/drawing-actions";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { StatusChip } from "@/components/drawing-status";
import { NewRevision, StatusSelect } from "@/components/drawing-upload";
import { DrawingViewer } from "@/components/drawing-viewer";
import { ProjectHeader } from "@/components/project-header";
import { DISCIPLINES } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isProjectMember, visibleProject } from "@/lib/data";
import { DISCIPLINE_LABEL, getDrawing, listGroups, projectTeam, revLabel, STATUS_LABEL, STATUS_PILL } from "@/lib/drawings";
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
  const [groups, team, member] = await Promise.all([listGroups(project.id), projectTeam(project.id), isProjectMember(user.id, project.id)]);

  const latest = revisions[0] ?? null;
  const wanted = Number((await searchParams).rev);
  const shown = revisions.find((r) => r.rev === wanted) ?? latest;
  const edit = can(user.role, "studio.manage") || can(user.role, "projects.edit") || member;
  const base = `/projects/${project.id}/drawings/${drawing.id}`;
  const name = drawing.number ? `${drawing.number} ${drawing.title}` : drawing.title;
  const group = groups.find((g) => g.id === drawing.groupId)?.name ?? "General";

  return (
    <div className="mx-auto max-w-[1136px]">
      <ProjectHeader
        project={project}
        crumbs={[{ href: `/projects/${project.id}/drawings`, label: "Drawings" }]}
        subtitle={`${group} · ${name} · ${DISCIPLINE_LABEL[drawing.discipline]}`}
        actions={
          edit && latest?.status === "draft" ? (
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
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-3 pt-4">
            <h2 id="sheet-title" className="card-title min-w-0">
              {drawing.title} {shown ? <span className="font-mono">{revLabel(shown.rev)}</span> : null}
              {shown && latest && shown.id !== latest.id ? <span className="ml-2 text-sm font-normal text-muted">superseded</span> : null}
            </h2>
            {edit ? <StatusSelect key={drawing.status} projectId={project.id} drawingId={drawing.id} status={drawing.status} label={name} /> : <StatusChip status={drawing.status} />}
          </div>
          {shown ? (
            <DrawingViewer key={shown.fileId} src={`/api/files/${shown.fileId}`} contentType={shown.contentType} title={`${name} ${revLabel(shown.rev)}`} />
          ) : (
            <p className="empty mx-5 mb-5">
              No file yet. The drawing is on the register with its status{edit ? "; upload the PDF when it is ready and it becomes R0" : ""}.
            </p>
          )}
        </section>

        <div className="grid grid-cols-1 gap-3">
          {edit && latest?.status === "issued" ? (
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
                      <input type="radio" name="decision" value="approved" defaultChecked className="h-4 w-4 accent-primary" /> Approved
                    </label>
                    <label className="flex min-h-10 items-center gap-2">
                      <input type="radio" name="decision" value="changes_requested" className="h-4 w-4 accent-primary" /> Changes requested
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
            {revisions.length === 0 ? <p className="px-5 pb-4 text-muted">None yet.</p> : null}
            <ol>
              {revisions.map((r) => {
                const decisions = approvals.filter((a) => a.revisionId === r.id);
                const current = r.id === shown?.id;
                const isLatest = r.id === latest?.id;
                return (
                  <li key={r.id} className={`border-t border-rule px-5 py-3 first:border-t-0 ${current ? "bg-active" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <Link href={isLatest ? base : `${base}?rev=${r.rev}`} aria-current={current ? "true" : undefined} className="min-w-0 hover:underline">
                        <span className="font-mono font-medium">{revLabel(r.rev)}</span>
                        <span className="ml-2 text-xs text-muted">
                          {dateFmt.format(r.createdAt)}
                          {r.createdByName ? ` · ${r.createdByName}` : ""}
                        </span>
                      </Link>
                      <span className={`pill ${isLatest ? STATUS_PILL[r.status] : ""}`}>{isLatest ? STATUS_LABEL[r.status] : "Superseded"}</span>
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
            {edit ? (
              <div className="border-t border-border bg-ground/60 p-5">
                <NewRevision projectId={project.id} drawingId={drawing.id} nextRev={latest ? latest.rev + 1 : 0} />
                <p className="mt-3 text-xs text-muted">A new revision is a draft until you issue it; clients keep seeing the last issued one.</p>
              </div>
            ) : null}
          </section>

          {edit ? (
            <section className="card p-5" aria-labelledby="details-title">
              <h2 id="details-title" className="card-title mb-4">Details</h2>
              <ActionForm
                key={`${drawing.title}|${drawing.number}|${drawing.groupId}|${drawing.assigneeId}|${drawing.clientVisible}|${drawing.discipline}`}
                action={updateDrawing}
                submitLabel="Save"
                pendingLabel="Saving…"
                primary={false}
                className="space-y-4"
              >
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="drawingId" value={drawing.id} />
                <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
                  <div>
                    <label htmlFor="d-title" className="field-label">Drawing</label>
                    <input id="d-title" name="title" required minLength={2} defaultValue={drawing.title} autoComplete="off" className="field" />
                  </div>
                  <div>
                    <label htmlFor="d-number" className="field-label">Sheet no.</label>
                    <input id="d-number" name="number" defaultValue={drawing.number ?? ""} autoComplete="off" spellCheck={false} className="field font-mono" />
                  </div>
                </div>
                <div>
                  <label htmlFor="d-group" className="field-label">Group</label>
                  <select id="d-group" name="groupId" defaultValue={drawing.groupId ?? ""} className="field">
                    <option value="">General</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="d-discipline" className="field-label">Discipline</label>
                    <select id="d-discipline" name="discipline" defaultValue={drawing.discipline} className="field">
                      {DISCIPLINES.map((d) => (
                        <option key={d} value={d}>{DISCIPLINE_LABEL[d]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="d-assignee" className="field-label">Drawn by</label>
                    <select id="d-assignee" name="assigneeId" defaultValue={drawing.assigneeId ?? ""} className="field">
                      <option value="">Not assigned</option>
                      {team.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="flex min-h-10 items-center gap-2">
                  <input type="checkbox" name="clientVisible" defaultChecked={drawing.clientVisible} className="h-4 w-4 accent-primary" />
                  Show on the client&rsquo;s drawing register
                </label>
              </ActionForm>
            </section>
          ) : null}

          {edit ? (
            <section className="card p-5" aria-labelledby="delete-title">
              <h2 id="delete-title" className="card-title mb-1">Delete drawing</h2>
              <p className="mb-4 text-muted">Removes it from the register with every revision and approval.</p>
              <form action={deleteDrawing}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="id" value={drawing.id} />
                <ConfirmButton message={`Delete ${name}${revisions.length ? ` and all ${revisions.length} revisions` : ""}?`}>Delete drawing</ConfirmButton>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
