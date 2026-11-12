"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { savePortal } from "@/app/portal-actions";
import { FILE_KINDS } from "@/lib/file-kinds";
import { uploadFile } from "@/lib/upload-client";

type Existing = {
  slug: string;
  enabled: boolean;
  hasPasscode: boolean;
  coverUrl: string | null;
  brief: string | null;
  area: string | null;
  sections: { drawings: boolean; models: boolean; tours: boolean; site: boolean };
} | null;

const SECTIONS = [
  ["drawings", "Drawings", "Drawings marked for clients, with status and current revision"],
  ["models", "3D models", "Every model on the project"],
  ["tours", "360° tours", "Every tour with at least one room"],
  ["site", "Site progress", "Site reports marked for the client"],
] as const;

/** Sets up the project's portal: its address, cover, description, passcode and what it shows. */
export function PortalSettings({
  projectId,
  origin,
  suggestedSlug,
  showSite,
  existing,
}: {
  projectId: string;
  origin: string;
  suggestedSlug: string;
  showSite: boolean;
  existing: Existing;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [slug, setSlug] = useState(existing?.slug ?? suggestedSlug);
  const [access, setAccess] = useState<"keep" | "set" | "none">(existing ? "keep" : "set");
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(existing?.coverUrl ?? null);
  const [removeCover, setRemoveCover] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const host = origin.replace(/^https?:\/\//, "");

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          setMessage(null);
          try {
            if (cover) {
              setMessage({ text: "Uploading the cover…" });
              data.set("cover", await uploadFile(projectId, "photo", cover));
            } else data.set("cover", removeCover ? "remove" : "");
            const res = await savePortal(undefined, data);
            if (res?.error) throw new Error(res.error);
            setMessage({ text: res?.ok ?? "Saved." });
            setCover(null);
            if (fileRef.current) fileRef.current.value = "";
            if (access === "set") setAccess("keep");
            router.refresh();
          } catch (err) {
            setMessage({ text: err instanceof Error ? err.message : "Couldn't save the portal.", error: true });
          }
        });
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />

      <div>
        <label htmlFor="portal-slug" className="field-label">Address</label>
        <div className="flex items-stretch">
          <span className="flex items-center rounded-l-md bg-raised px-3 text-muted">{host}/</span>
          <input
            id="portal-slug"
            name="slug"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="portal-slug-help"
            className="field min-w-0 flex-1 rounded-l-none"
          />
        </div>
        <p id="portal-slug-help" className="mt-2 text-xs text-muted">Lowercase letters, numbers and hyphens.</p>
      </div>

      <div>
        <span className="field-label">Cover image</span>
        {preview && !removeCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Cover preview" width={480} height={270} className="mb-2 aspect-[16/9] w-full rounded-md bg-raised object-cover" />
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            aria-label="Choose a cover image"
            type="file"
            accept={FILE_KINDS.photo.accept}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setCover(f);
              setRemoveCover(false);
              setPreview(f ? URL.createObjectURL(f) : existing?.coverUrl ?? null);
            }}
            className="block min-w-0 flex-1 text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border-0 file:bg-[#e5e5e5] file:px-3 file:font-medium"
          />
          {existing?.coverUrl && !cover && !removeCover ? (
            <button type="button" className="btn btn-quiet h-9 text-xs" onClick={() => setRemoveCover(true)}>Remove</button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted">A render or photo of the house. It fills the left side of the cover page and is cropped to fit, so keep the house near the middle.</p>
      </div>

      <div>
        <label htmlFor="portal-brief" className="field-label">About the project</label>
        <textarea
          id="portal-brief"
          name="brief"
          rows={3}
          maxLength={600}
          defaultValue={existing?.brief ?? ""}
          placeholder="e.g. A two-storey family home around a central courtyard, with a sloping tiled roof."
          className="field h-auto py-2"
        />
      </div>

      <div>
        <label htmlFor="portal-area" className="field-label">Area</label>
        <input id="portal-area" name="area" maxLength={60} defaultValue={existing?.area ?? ""} placeholder="e.g. 3,200 sq ft" autoComplete="off" className="field" />
      </div>

      <fieldset>
        <legend className="field-label">Show</legend>
        <ul className="space-y-1">
          {SECTIONS.filter(([key]) => key !== "site" || showSite).map(([key, label, help]) => (
            <li key={key}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-ground">
                <input type="checkbox" name={key} defaultChecked={existing ? existing.sections[key] : true} className="mt-0.5 h-4 w-4 flex-none accent-[#141414]" />
                <span>
                  <span className="block">{label}</span>
                  <span className="block text-xs text-muted">{help}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="field-label">Access</legend>
        <div className="space-y-1">
          {existing?.hasPasscode ? (
            <label className="flex min-h-10 items-center gap-2">
              <input type="radio" name="access" value="keep" checked={access === "keep"} onChange={() => setAccess("keep")} className="h-4 w-4 accent-[#141414]" />
              Keep the current passcode
            </label>
          ) : existing ? (
            <label className="flex min-h-10 items-center gap-2">
              <input type="radio" name="access" value="keep" checked={access === "keep"} onChange={() => setAccess("keep")} className="h-4 w-4 accent-[#141414]" />
              Keep it open, no passcode
            </label>
          ) : null}
          <label className="flex min-h-10 items-center gap-2">
            <input type="radio" name="access" value="set" checked={access === "set"} onChange={() => setAccess("set")} className="h-4 w-4 accent-[#141414]" />
            {existing?.hasPasscode ? "Set a new passcode" : "Ask for a passcode (recommended)"}
          </label>
          {access === "set" ? (
            <input name="passcode" aria-label="Portal passcode" minLength={4} required autoComplete="off" spellCheck={false} placeholder="At least 4 characters" className="field ml-6 w-[calc(100%-1.5rem)]" />
          ) : null}
          {existing?.hasPasscode || !existing ? (
            <label className="flex min-h-10 items-center gap-2">
              <input type="radio" name="access" value="none" checked={access === "none"} onChange={() => setAccess("none")} className="h-4 w-4 accent-[#141414]" />
              No passcode
            </label>
          ) : null}
        </div>
        {access === "none" || (existing && !existing.hasPasscode && access === "keep") ? (
          <p className="mt-2 text-xs text-negative">The address is the project name, so anyone who guesses it can open the portal.</p>
        ) : null}
      </fieldset>

      <label className="flex min-h-10 items-center gap-2">
        <input type="checkbox" name="enabled" defaultChecked={existing ? existing.enabled : true} className="h-4 w-4 accent-[#141414]" />
        Portal is open to the client
      </label>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Saving…" : existing ? "Save portal" : "Create portal"}</button>
        <p aria-live="polite" className={message?.error ? "text-negative" : "text-muted"}>{message?.text ?? ""}</p>
      </div>
    </form>
  );
}
