"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { addHeading, addSubWork, importWorks, renameSection, updateWork } from "@/app/works-actions";
import { parseBoq } from "@/lib/boq";

type State = { error?: string; ok?: string } | undefined;

function Message({ state }: { state: State }) {
  return (
    <p aria-live="polite" className={state?.error ? "text-negative" : "text-muted"}>
      {state?.error ?? state?.ok ?? ""}
    </p>
  );
}

/** Clears a form after it saves, by bumping its key. */
function useResetOnOk(state: State) {
  const [key, setKey] = useState(0);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setKey((k) => k + 1);
  }
  return key;
}

/** Paste a BOQ from Excel, check what was read, then add it. */
export function BoqImport({ projectId, hasWorks, canReplace }: { projectId: string; hasWorks: boolean; canReplace: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [state, setState] = useState<State>();
  const [pending, start] = useTransition();
  const rows = useMemo(() => parseBoq(text), [text]);
  const sections = useMemo(() => [...new Set(rows.map((r) => r.section))], [rows]);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (replace && !window.confirm("Replace the whole timeline? Every work on it now, with its dates, will be removed.")) return;
        start(async () => {
          const res = await importWorks({ projectId, replace, rows });
          setState(res);
          if (res.ok) {
            setText("");
            setReplace(false);
            router.refresh();
          }
        });
      }}
    >
      <label htmlFor="boq-paste" className="field-label">Paste the BOQ</label>
      <textarea
        id="boq-paste"
        rows={5}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setState(undefined);
        }}
        placeholder="Select the rows in Excel (Sl. to Amount) and paste here."
        spellCheck={false}
        className="field h-auto py-2 font-mono text-xs"
        aria-describedby="boq-help"
      />
      <p id="boq-help" className="text-xs text-muted">
        Heads such as “2 EXCAVATION” become main works and the items under them sub works. Sub-totals and GST lines are skipped.
      </p>
      {rows.length ? (
        <div className="rounded-md bg-ground p-3 text-sm">
          <p className="font-medium">
            {rows.length} sub {rows.length === 1 ? "work" : "works"} under {sections.length} main {sections.length === 1 ? "work" : "works"}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {sections.slice(0, 8).map((sec) => (
              <li key={sec} className="truncate">
                {sec}: {rows.filter((r) => r.section === sec).length}
              </li>
            ))}
            {sections.length > 8 ? <li>and {sections.length - 8} more</li> : null}
          </ul>
        </div>
      ) : text.trim() ? (
        <p className="text-sm text-negative">No works found. Copy the rows straight from Excel so the columns stay apart.</p>
      ) : null}
      {hasWorks && canReplace ? (
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4 accent-primary" />
          Replace the current timeline instead of adding to it
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending || !rows.length} className="btn btn-primary">
          {pending ? "Adding…" : rows.length ? `Add ${rows.length} sub ${rows.length === 1 ? "work" : "works"}` : "Add works"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

/** A new main work with its sub works, one per line. */
export function AddHeadingForm({ projectId, next }: { projectId: string; next: number }) {
  const [state, action, pending] = useActionState(addHeading, undefined);
  const key = useResetOnOk(state);
  return (
    <form action={action} className="space-y-3" key={key}>
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <label htmlFor="new-heading" className="field-label">Main work</label>
        <div className="flex items-stretch">
          <span className="num flex w-11 flex-none items-center justify-center rounded-l-md bg-raised font-semibold text-muted" aria-hidden="true">
            {next}
          </span>
          <input id="new-heading" name="section" required minLength={2} maxLength={120} placeholder="e.g. Excavation" autoComplete="off" className="field min-w-0 flex-1 rounded-l-none" />
        </div>
      </div>
      <div>
        <label htmlFor="new-subs" className="field-label">Sub works, one per line</label>
        <textarea
          id="new-subs"
          name="subs"
          required
          rows={4}
          placeholder={"Excavation for footing\nExcavation for plinth beam"}
          className="field h-auto py-2"
          aria-describedby="new-subs-help"
        />
        <p id="new-subs-help" className="mt-2 text-xs text-muted">
          Numbered {next}.1, {next}.2… in this order. Progress counts the sub works completed.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Adding…" : "Add main work"}</button>
        <Message state={state} />
      </div>
    </form>
  );
}

/** One more sub work at the end of a main work. */
export function AddSubWorkForm({ projectId, section, next }: { projectId: string; section: string; next: string }) {
  const [state, action, pending] = useActionState(addSubWork, undefined);
  const key = useResetOnOk(state);
  const id = `sub-${next.replace(/\W/g, "-")}`;
  return (
    <form action={action} className="space-y-3" key={key}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="section" value={section} />
      <div>
        <label htmlFor={`${id}-title`} className="field-label">Sub work {next}</label>
        <input id={`${id}-title`} name="title" required minLength={2} maxLength={2000} placeholder="e.g. Excavation for lift pit" autoComplete="off" className="field" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-ps`} className="field-label">Planned start</label>
          <input id={`${id}-ps`} name="plannedStart" type="date" className="field" />
        </div>
        <div>
          <label htmlFor={`${id}-pe`} className="field-label">Planned finish</label>
          <input id={`${id}-pe`} name="plannedEnd" type="date" className="field" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Adding…" : "Add sub work"}</button>
        <Message state={state} />
      </div>
    </form>
  );
}

/** Renames a main work. */
export function RenameSectionForm({ projectId, section, index }: { projectId: string; section: string; index: number }) {
  const [state, action, pending] = useActionState(renameSection, undefined);
  const id = `rename-${index}`;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="from" value={section} />
      <div className="min-w-0 flex-1 basis-[200px]">
        <label htmlFor={id} className="field-label">Main work name</label>
        <input id={id} name="to" required minLength={2} maxLength={120} defaultValue={section} autoComplete="off" className="field" />
      </div>
      <button type="submit" disabled={pending} className="btn btn-secondary">{pending ? "Saving…" : "Rename"}</button>
      <div className="basis-full">
        <Message state={state} />
      </div>
    </form>
  );
}

/** Edits a sub work, including when it really started and finished. */
export function WorkEditor({
  work,
  sections,
  today,
}: {
  work: { id: string; section: string; title: string; plannedStart: string | null; plannedEnd: string | null; startedOn: string | null; completedOn: string | null; note: string | null };
  sections: string[];
  today: string;
}) {
  const [state, action, pending] = useActionState(updateWork, undefined);
  const p = `w-${work.id.slice(0, 8)}`;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={work.id} />
      <div>
        <label htmlFor={`${p}-title`} className="field-label">Sub work</label>
        <textarea id={`${p}-title`} name="title" required minLength={2} rows={2} defaultValue={work.title} className="field h-auto py-2" />
      </div>
      <div>
        <label htmlFor={`${p}-section`} className="field-label">Under main work</label>
        <select id={`${p}-section`} name="section" defaultValue={work.section} className="field">
          {sections.map((sec, i) => (
            <option key={sec} value={sec}>
              {i + 1}. {sec}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${p}-ps`} className="field-label">Planned start</label>
          <input id={`${p}-ps`} name="plannedStart" type="date" defaultValue={work.plannedStart ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor={`${p}-pe`} className="field-label">Planned finish</label>
          <input id={`${p}-pe`} name="plannedEnd" type="date" defaultValue={work.plannedEnd ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor={`${p}-so`} className="field-label">Started on</label>
          <input id={`${p}-so`} name="startedOn" type="date" max={today} defaultValue={work.startedOn ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor={`${p}-co`} className="field-label">Completed on</label>
          <input id={`${p}-co`} name="completedOn" type="date" max={today} defaultValue={work.completedOn ?? ""} className="field" />
        </div>
      </div>
      <div>
        <label htmlFor={`${p}-note`} className="field-label">Note (optional)</label>
        <input id={`${p}-note`} name="note" maxLength={1000} defaultValue={work.note ?? ""} placeholder="e.g. Held up by rain for two days" autoComplete="off" className="field" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Saving…" : "Save"}</button>
        <Message state={state} />
      </div>
    </form>
  );
}
