"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { addHeading, addSubWork, importWorks, renameSection, updateWork } from "@/app/works-actions";
import { combineSheets, defaultSheets, parseBoq, parseBoqRows } from "@/lib/boq";
import { readBoqFile, type BoqSheet } from "@/lib/boq-files";

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

/** Upload a BOQ (Excel, CSV or PDF) or paste it, check what was read, then add it. */
export function BoqImport({ projectId, hasWorks, canReplace }: { projectId: string; hasWorks: boolean; canReplace: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [sheets, setSheets] = useState<BoqSheet[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [replace, setReplace] = useState(false);
  const [state, setState] = useState<State>();
  const [pending, start] = useTransition();
  const perSheet = useMemo(() => (sheets ?? []).map((s) => parseBoqRows(s.rows, { startSection: s.name })), [sheets]);
  const rows = useMemo(() => (sheets ? combineSheets(sheets, perSheet, picked) : parseBoq(text)), [sheets, perSheet, picked, text]);
  const sections = useMemo(() => [...new Set(rows.map((r) => r.section))], [rows]);

  const clearFile = () => {
    setSheets(null);
    setPicked([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    setState(undefined);
    if (!file) return clearFile();
    setReading(true);
    setFileName(file.name);
    try {
      const read = await readBoqFile(file);
      setSheets(read);
      setPicked(defaultSheets(read));
      setText("");
    } catch (err) {
      clearFile();
      setState({ error: err instanceof Error ? err.message : "Couldn't read that file." });
    } finally {
      setReading(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (replace && !window.confirm("Replace the whole timeline? Every work on it now, with its dates, will be removed.")) return;
        start(async () => {
          const res = await importWorks({ projectId, replace, rows: rows.map((r) => ({ ...r, unit: null, qty: null, rate: null, amount: null })) });
          setState(res);
          if (res.ok) {
            setText("");
            clearFile();
            setReplace(false);
            router.refresh();
          }
        });
      }}
    >
      <div>
        <label htmlFor="boq-file" className="field-label">Upload the BOQ</label>
        <input
          ref={fileRef}
          id="boq-file"
          type="file"
          accept=".xlsx,.xlsm,.csv,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => onFile(e.target.files?.[0])}
          aria-describedby="boq-help"
          className="block w-full text-sm file:mr-3 file:h-10 file:cursor-pointer file:rounded-md file:border-0 file:bg-raised file:px-4 file:font-medium"
        />
        <p id="boq-help" className="mt-2 text-xs text-muted">
          Excel (.xlsx), CSV or PDF. Heads such as “2 EXCAVATION” become main works and the items under them sub works. Quantities, rates, sub-totals and GST are left out. The file stays on this device.
        </p>
      </div>

      {sheets && sheets.length > 1 ? (
        <fieldset>
          <legend className="field-label">Sheets to add, in this order</legend>
          <ul className="space-y-1">
            {sheets.map((s, i) => {
              const n = perSheet[i]?.length ?? 0;
              return (
                <li key={`${s.name}-${i}`}>
                  <label className={`flex min-h-10 items-center gap-3 rounded-md px-2 ${n ? "cursor-pointer hover:bg-ground" : "opacity-50"}`}>
                    <input
                      type="checkbox"
                      disabled={!n}
                      checked={picked.includes(i)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i].sort((a, b) => a - b) : p.filter((x) => x !== i)))}
                      className="h-4 w-4 flex-none accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="num flex-none text-xs text-muted">{n ? `${n} ${n === 1 ? "work" : "works"}` : "no works"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : null}

      {!sheets ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">Or paste rows from Excel</summary>
          <label htmlFor="boq-paste" className="sr-only">Paste the BOQ</label>
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
            className="field mt-2 h-auto py-2 font-mono text-xs"
          />
        </details>
      ) : null}

      {reading ? <p className="text-sm text-muted" aria-live="polite">Reading {fileName}…</p> : null}

      {rows.length ? (
        <div className="rounded-md bg-ground p-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="font-medium">
              {sections.length} main {sections.length === 1 ? "work" : "works"}, {rows.length} sub {rows.length === 1 ? "work" : "works"}
            </p>
            {sheets ? (
              <button type="button" onClick={clearFile} className="text-xs font-medium text-primary hover:underline">Clear file</button>
            ) : null}
          </div>
          <ol className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1 text-xs">
            {sections.map((sec, si) => {
              const subs = rows.filter((r) => r.section === sec);
              return (
                <li key={sec}>
                  <p className="font-semibold">
                    {si + 1}. {sec} <span className="font-normal text-muted">· {subs.length}</span>
                  </p>
                  <ol className="mt-0.5 space-y-0.5 text-muted">
                    {subs.slice(0, 3).map((r, i) => (
                      <li key={i} className="truncate">
                        {si + 1}.{i + 1} {r.title}
                      </li>
                    ))}
                    {subs.length > 3 ? <li>and {subs.length - 3} more</li> : null}
                  </ol>
                </li>
              );
            })}
          </ol>
        </div>
      ) : sheets && !reading ? (
        <p className="text-sm text-negative">No works found in {fileName}. Check that it has numbered items (1.1, 1.2…) under numbered heads.</p>
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
        <button type="submit" disabled={pending || reading || !rows.length} className="btn btn-primary">
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
