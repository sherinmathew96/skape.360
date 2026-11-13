"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { addWork, importWorks, updateWork } from "@/app/works-actions";
import { parseBoq } from "@/lib/boq";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function Message({ state }: { state: { error?: string; ok?: string } | undefined }) {
  return (
    <p aria-live="polite" className={state?.error ? "text-negative" : "text-muted"}>
      {state?.error ?? state?.ok ?? ""}
    </p>
  );
}

/** Paste a BOQ from Excel (or a list of milestones), check what was read, then add it. */
export function BoqImport({ projectId, hasWorks, canReplace }: { projectId: string; hasWorks: boolean; canReplace: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [state, setState] = useState<{ error?: string; ok?: string }>();
  const [pending, start] = useTransition();
  const rows = useMemo(() => parseBoq(text), [text]);
  const sections = useMemo(() => [...new Set(rows.map((r) => r.section))], [rows]);
  const value = rows.reduce((a, r) => a + (r.amount ?? 0), 0);

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
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setState(undefined);
        }}
        placeholder={"Select the rows in Excel (Sl. to Amount) and paste here.\nOr type milestones, one per line."}
        spellCheck={false}
        className="field h-auto py-2 font-mono text-xs"
        aria-describedby="boq-help"
      />
      <p id="boq-help" className="text-xs text-muted">
        Heads such as “2 EXCAVATION” become sections; sub-totals and GST lines are skipped.
      </p>
      {rows.length ? (
        <div className="rounded-md bg-ground p-3 text-sm">
          <p className="font-medium">
            {rows.length} {rows.length === 1 ? "work" : "works"} in {sections.length} {sections.length === 1 ? "section" : "sections"}
            {value ? <span className="num text-muted"> · {inr.format(value)}</span> : null}
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
          {pending ? "Adding…" : rows.length ? `Add ${rows.length} ${rows.length === 1 ? "work" : "works"}` : "Add works"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

function Fields({
  idPrefix,
  sections,
  money,
  work,
}: {
  idPrefix: string;
  sections: string[];
  money: boolean;
  work?: { section: string; code: string | null; title: string; unit: string | null; qty: number | null; rate: number | null; plannedStart: string | null; plannedEnd: string | null };
}) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
        <div>
          <label htmlFor={id("section")} className="field-label">Section</label>
          <input id={id("section")} name="section" list={`${idPrefix}-sections`} defaultValue={work?.section ?? sections.at(-1) ?? ""} placeholder="e.g. Excavation" autoComplete="off" className="field" />
          <datalist id={`${idPrefix}-sections`}>
            {sections.map((sec) => (
              <option key={sec} value={sec} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor={id("code")} className="field-label">Item no.</label>
          <input id={id("code")} name="code" defaultValue={work?.code ?? ""} placeholder="2.1" autoComplete="off" className="field" />
        </div>
      </div>
      <div>
        <label htmlFor={id("title")} className="field-label">Work or milestone</label>
        <textarea id={id("title")} name="title" required minLength={2} rows={2} defaultValue={work?.title ?? ""} placeholder="e.g. Plinth beam concreting, Block 01" className="field h-auto py-2" />
      </div>
      <div className={`grid gap-3 ${money ? "grid-cols-3" : "grid-cols-2"}`}>
        <div>
          <label htmlFor={id("unit")} className="field-label">Unit</label>
          <input id={id("unit")} name="unit" defaultValue={work?.unit ?? ""} placeholder="m³" autoComplete="off" className="field" />
        </div>
        <div>
          <label htmlFor={id("qty")} className="field-label">Qty</label>
          <input id={id("qty")} name="qty" inputMode="decimal" defaultValue={work?.qty ?? ""} autoComplete="off" className="field num text-right" />
        </div>
        {money ? (
          <div>
            <label htmlFor={id("rate")} className="field-label">Rate (₹)</label>
            <input id={id("rate")} name="rate" inputMode="decimal" defaultValue={work?.rate ?? ""} autoComplete="off" className="field num text-right" />
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={id("ps")} className="field-label">Planned start</label>
          <input id={id("ps")} name="plannedStart" type="date" defaultValue={work?.plannedStart ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor={id("pe")} className="field-label">Planned finish</label>
          <input id={id("pe")} name="plannedEnd" type="date" defaultValue={work?.plannedEnd ?? ""} className="field" />
        </div>
      </div>
    </>
  );
}

/** Adds one work or milestone to the timeline. */
export function AddWorkForm({ projectId, sections, money }: { projectId: string; sections: string[]; money: boolean }) {
  const [state, action, pending] = useActionState(addWork, undefined);
  const [key, setKey] = useState(0);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setKey((k) => k + 1);
  }
  return (
    <form action={action} className="space-y-3" key={key}>
      <input type="hidden" name="projectId" value={projectId} />
      <Fields idPrefix="new-work" sections={sections} money={money} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Adding…" : "Add to timeline"}</button>
        <Message state={state} />
      </div>
    </form>
  );
}

/** Edits a work, including when it really started and finished. */
export function WorkEditor({
  work,
  sections,
  money,
  today,
}: {
  work: { id: string; section: string; code: string | null; title: string; unit: string | null; qty: number | null; rate: number | null; amount: number | null; plannedStart: string | null; plannedEnd: string | null; startedOn: string | null; completedOn: string | null; note: string | null };
  sections: string[];
  money: boolean;
  today: string;
}) {
  const [state, action, pending] = useActionState(updateWork, undefined);
  const p = `w-${work.id.slice(0, 8)}`;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={work.id} />
      {!money ? <input type="hidden" name="rate" value={work.rate ?? ""} /> : null}
      {/* A BOQ value with no rate (a lump sum) is kept as it is. */}
      {work.rate === null && work.amount !== null ? <input type="hidden" name="amount" value={work.amount} /> : null}
      <Fields idPrefix={p} sections={sections} money={money} work={work} />
      <div className="grid grid-cols-2 gap-3">
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
