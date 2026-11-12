"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { saveReport } from "@/app/site-actions";
import { ActionForm } from "./action-form";

const WEATHER = [
  ["sunny", "Sunny"],
  ["cloudy", "Cloudy"],
  ["rain", "Rain"],
  ["heavy_rain", "Heavy rain"],
] as const;

type Line = { key: number; trade: string; count: string };

/** The daily report form: built for a phone held on site. */
export function ReportForm({
  projectId,
  initial,
  commonTrades,
}: {
  projectId: string;
  commonTrades: string[];
  initial: {
    reportId?: string;
    date: string;
    weather?: string;
    labour: { trade: string; count: number }[];
    workDone: string;
    issues: string;
    clientVisible: boolean;
  };
}) {
  const [lines, setLines] = useState<Line[]>(() => {
    const start = initial.labour.length ? initial.labour : commonTrades.slice(0, 3).map((trade) => ({ trade, count: 0 }));
    return start.map((l, key) => ({ key, trade: l.trade, count: l.count ? String(l.count) : "" }));
  });
  const [nextKey, setNextKey] = useState(lines.length);
  const total = lines.reduce((n, l) => n + (Number(l.count) || 0), 0);

  return (
    <ActionForm action={saveReport} submitLabel={initial.reportId ? "Save changes" : "Save report"} pendingLabel="Saving…" className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />
      {initial.reportId ? <input type="hidden" name="reportId" value={initial.reportId} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="r-date" className="field-label">Date</label>
          <input id="r-date" name="date" type="date" required defaultValue={initial.date} className="field" />
        </div>
        <fieldset>
          <legend className="field-label">Weather</legend>
          <div className="grid grid-cols-4 gap-1 rounded-md bg-raised p-1">
            {WEATHER.map(([value, label]) => (
              <label key={value} className="flex min-h-10 cursor-pointer items-center justify-center rounded-[5px] px-1 text-center text-xs has-[:checked]:bg-surface has-[:checked]:font-medium has-[:focus-visible]:outline-2 md:min-h-8">
                <input type="radio" name="weather" value={value} defaultChecked={initial.weather === value} required className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset>
        <legend className="field-label flex w-full justify-between">
          <span>Labour on site</span>
          <span className="num font-normal text-muted">{total} total</span>
        </legend>
        <ul className="space-y-2">
          {lines.map((line, i) => (
            <li key={line.key} className="flex items-center gap-2">
              <label htmlFor={`trade-${line.key}`} className="sr-only">Trade {i + 1}</label>
              <input
                id={`trade-${line.key}`}
                name="trade"
                list="trades"
                value={line.trade}
                onChange={(e) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, trade: e.target.value } : l)))}
                autoComplete="off"
                className="field min-w-0 flex-1"
              />
              <label htmlFor={`count-${line.key}`} className="sr-only">Number of {line.trade || "workers"}</label>
              <input
                id={`count-${line.key}`}
                name="count"
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                value={line.count}
                onChange={(e) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, count: e.target.value } : l)))}
                className="field num w-20 flex-none text-right"
              />
              <button
                type="button"
                aria-label={`Remove ${line.trade || "this line"}`}
                onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                className="btn btn-quiet h-10 w-10 flex-none p-0 text-muted"
              >
                <X size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <datalist id="trades">
          {commonTrades.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={() => {
            const unused = commonTrades.find((t) => !lines.some((l) => l.trade === t)) ?? "";
            setLines((ls) => [...ls, { key: nextKey, trade: unused, count: "" }]);
            setNextKey((k) => k + 1);
          }}
          className="btn btn-quiet mt-2 px-2"
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" /> Add trade
        </button>
      </fieldset>

      <div>
        <label htmlFor="r-work" className="field-label">Work done today</label>
        <textarea id="r-work" name="workDone" required rows={4} defaultValue={initial.workDone} className="field h-auto py-2" />
      </div>
      <div>
        <label htmlFor="r-issues" className="field-label">Issues and delays</label>
        <textarea id="r-issues" name="issues" rows={3} defaultValue={initial.issues} aria-describedby="r-issues-help" className="field h-auto py-2" />
        <p id="r-issues-help" className="mt-2 text-xs text-muted">For the office only. Clients never see this.</p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input type="checkbox" name="clientVisible" defaultChecked={initial.clientVisible} className="mt-0.5 h-5 w-5 flex-none accent-[#141414]" />
        <span>
          Show on client progress updates
          <span className="block text-xs text-muted">The date, weather, work done and photos. Not labour or issues.</span>
        </span>
      </label>
    </ActionForm>
  );
}
