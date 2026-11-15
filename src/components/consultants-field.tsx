"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

export type Consultant = { role: string; name: string };

const ROLES = ["PMC", "Interior", "Architect", "Structural", "MEP", "Landscape", "Lighting", "Contractor"];

/** The project's consultants (PMC, interior, structural…), each a role and a name. */
export function ConsultantsField({ initial = [] }: { initial?: Consultant[] }) {
  const [rows, setRows] = useState<(Consultant & { key: number })[]>(initial.map((c, i) => ({ ...c, key: i })));
  const [next, setNext] = useState(initial.length);
  const update = (key: number, patch: Partial<Consultant>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  return (
    <fieldset>
      <legend className="field-label">Consultants</legend>
      {rows.length ? (
        <ul className="mb-2 space-y-2">
          {rows.map((r, i) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-2">
              <label htmlFor={`c-role-${r.key}`} className="sr-only">Role of consultant {i + 1}</label>
              <input
                id={`c-role-${r.key}`}
                name="consultantRole"
                list="consultant-roles"
                value={r.role}
                onChange={(e) => update(r.key, { role: e.target.value })}
                placeholder="Role, e.g. PMC"
                maxLength={40}
                autoComplete="off"
                className="field"
              />
              <label htmlFor={`c-name-${r.key}`} className="sr-only">Name of consultant {i + 1}</label>
              <input
                id={`c-name-${r.key}`}
                name="consultantName"
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })}
                placeholder="Firm or person, e.g. Curves & Lines"
                maxLength={80}
                autoComplete="off"
                className="field"
              />
              <button type="button" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} className="btn btn-quiet h-11 w-11 p-0 text-muted hover:text-negative" aria-label={`Remove consultant ${i + 1}`}>
                <X size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <datalist id="consultant-roles">
        {ROLES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      {rows.length < 10 ? (
        <button
          type="button"
          onClick={() => {
            setRows((r) => [...r, { key: next, role: "", name: "" }]);
            setNext((n) => n + 1);
          }}
          className="btn btn-secondary h-10 gap-1.5 px-3 text-sm"
        >
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
          Add consultant
        </button>
      ) : null}
      <p className="mt-2 text-xs text-muted">The PMC, interior designer, structural consultant and others on the project. They show on the client&rsquo;s cover page.</p>
    </fieldset>
  );
}
