"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { clientRegister } from "@/lib/drawings";
import { ClientDecision } from "./client-decision";
import { StatusChip } from "./drawing-status";
import { DrawingViewer } from "./drawing-viewer";

type Register = Awaited<ReturnType<typeof clientRegister>>;

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * The client's view of the drawing register: every drawing with its status
 * and current revision, grouped like the studio's sheet. Picking one opens
 * it beside the list on a computer and full screen on a phone.
 */
export function ClientRegister({
  register,
  token,
  portal,
  fileBase,
  initialId,
}: {
  register: Register;
  token?: string;
  portal?: string;
  fileBase: string;
  /** Opens this drawing at once, e.g. from "Waiting for your approval" */
  initialId?: string;
}) {
  const all = register.flatMap((g) => g.drawings);
  const initial = all.find((d) => d.id === initialId && d.revision);
  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? all.find((d) => d.revision)?.id ?? null);
  const [open, setOpen] = useState(Boolean(initial));
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = all.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // The overlay only covers the page below the lg breakpoint.
    const lock = window.matchMedia("(max-width: 1023px)").matches;
    if (lock) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const rev = selected?.revision ?? null;
  const label = rev ? `R${rev.rev}` : "";
  const name = selected ? [selected.number, selected.title].filter(Boolean).join(" ") : "";

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="card min-w-0">
        {register.map((g) => (
          <div key={g.id ?? "general"} className="border-t border-rule first:border-t-0">
            <h3 className="bg-ground/60 px-4 py-2 text-xs font-medium uppercase tracking-[0.04em] text-muted">{g.name}</h3>
            <ul>
              {g.drawings.map((d) => {
                const current = d.id === selectedId;
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.title}</span>
                      <span className="num block truncate text-xs leading-4 text-muted">
                        {[d.number, d.revision ? `R${d.revision.rev}` : "Not issued yet", dateFmt.format(d.statusChangedAt)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <StatusChip status={d.status} />
                  </>
                );
                return (
                  <li key={d.id} className="border-t border-rule">
                    {d.revision ? (
                      <button
                        type="button"
                        aria-current={current ? "true" : undefined}
                        onClick={() => {
                          setSelectedId(d.id);
                          setOpen(true);
                        }}
                        className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-ground ${current ? "lg:bg-active" : ""}`}
                      >
                        {body}
                        <ChevronRight size={16} strokeWidth={1.5} className="flex-none text-muted" aria-hidden="true" />
                      </button>
                    ) : (
                      <div className="flex min-h-14 items-center gap-3 px-4 py-2 pr-11">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? name : undefined}
        className={`${open ? "fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-ground p-3" : "hidden"} lg:static lg:z-auto lg:block lg:overflow-visible lg:bg-transparent lg:p-0`}
      >
        {selected && rev ? (
          <div className="grid grid-cols-1 gap-3 lg:sticky lg:top-4">
            <div className="card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {selected.title} <span className="font-mono text-sm font-normal text-muted">{label}</span>
                  </p>
                  <p className="num truncate text-xs leading-4 text-muted">
                    {[selected.number, `issued ${dateFmt.format(rev.issuedAt ?? rev.createdAt)}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <StatusChip status={selected.status} />
                <button ref={closeRef} type="button" className="btn btn-quiet h-10 w-10 flex-none p-0 lg:hidden" aria-label="Close drawing" onClick={() => setOpen(false)}>
                  <X size={18} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
              <DrawingViewer key={rev.fileId} src={`${fileBase}${rev.fileId}`} contentType={rev.contentType} title={`${name} ${label}`} />
            </div>
            {rev.note || rev.status === "issued" || rev.decision ? (
              <div className="card p-5">
                {rev.note ? (
                  <>
                    <h3 className="mb-1 font-medium">What changed</h3>
                    <p className="mb-4 whitespace-pre-line text-muted">{rev.note}</p>
                  </>
                ) : null}
                {rev.status === "issued" ? (
                  <ClientDecision key={rev.id} token={token} portal={portal} revisionId={rev.id} label={label} />
                ) : rev.decision ? (
                  <div role="status">
                    <p className={rev.decision.decision === "approved" ? "font-medium text-positive" : "font-medium text-negative"}>
                      {rev.decision.decision === "approved" ? `${label} approved` : "Changes requested"}
                    </p>
                    <p className="text-muted">
                      by {rev.decision.name}, {dateFmt.format(rev.decision.createdAt)}
                    </p>
                    {rev.decision.comment ? <p className="mt-3 whitespace-pre-line">{rev.decision.comment}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="empty hidden lg:block">Drawings open here once the studio issues them.</p>
        )}
      </div>
    </div>
  );
}
