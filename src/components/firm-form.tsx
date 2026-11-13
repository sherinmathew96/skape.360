"use client";

import { useState } from "react";
import { createFirm, updateFirm } from "@/app/firm-actions";
import { ActionForm } from "./action-form";

type Firm = {
  id: string;
  name: string;
  slug: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  enabled: boolean;
  hasPasscode: boolean;
};

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Add or edit a firm: its name, contact, page address and passcode. */
export function FirmForm({ host, firm }: { host: string; firm?: Firm }) {
  const [name, setName] = useState(firm?.name ?? "");
  const [slug, setSlug] = useState(firm?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(firm));
  const [access, setAccess] = useState<"keep" | "set" | "none">(firm ? "keep" : "set");

  return (
    <ActionForm
      key={firm ? firm.id : "new"}
      action={firm ? updateFirm : createFirm}
      submitLabel={firm ? "Save" : "Add firm"}
      pendingLabel="Saving…"
      className="space-y-4"
    >
      {firm ? <input type="hidden" name="firmId" value={firm.id} /> : null}
      <div>
        <label htmlFor="firm-name" className="field-label">Firm name</label>
        <input
          id="firm-name"
          name="name"
          required
          minLength={2}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(toSlug(e.target.value));
          }}
          placeholder="e.g. Curves and Lines"
          autoComplete="off"
          className="field"
        />
      </div>
      <div>
        <label htmlFor="firm-slug" className="field-label">Page address</label>
        <div className="flex items-stretch">
          <span className="flex items-center rounded-l-[10px] border border-r-0 border-control bg-raised px-3 text-sm text-muted">{host}/</span>
          <input
            id="firm-slug"
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
            }}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="firm-slug-help"
            className="field min-w-0 flex-1 rounded-l-none"
          />
        </div>
        <p id="firm-slug-help" className="mt-2 text-xs text-muted">Lowercase letters, numbers and hyphens.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firm-contact" className="field-label">Contact person</label>
          <input id="firm-contact" name="contactName" defaultValue={firm?.contactName ?? ""} autoComplete="off" className="field" />
        </div>
        <div>
          <label htmlFor="firm-phone" className="field-label">Phone</label>
          <input id="firm-phone" name="phone" type="tel" inputMode="tel" defaultValue={firm?.phone ?? ""} autoComplete="off" className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="firm-email" className="field-label">Email</label>
        <input id="firm-email" name="email" type="email" defaultValue={firm?.email ?? ""} autoComplete="off" spellCheck={false} className="field" />
      </div>

      <fieldset>
        <legend className="field-label">Access to the firm&rsquo;s page</legend>
        <div className="space-y-1">
          {firm ? (
            <label className="flex min-h-10 items-center gap-2">
              <input type="radio" name="access" value="keep" checked={access === "keep"} onChange={() => setAccess("keep")} className="h-4 w-4" />
              {firm.hasPasscode ? "Keep the current passcode" : "Keep it open, no passcode"}
            </label>
          ) : null}
          <label className="flex min-h-10 items-center gap-2">
            <input type="radio" name="access" value="set" checked={access === "set"} onChange={() => setAccess("set")} className="h-4 w-4" />
            {firm?.hasPasscode ? "Set a new passcode" : "Ask for a passcode (recommended)"}
          </label>
          {access === "set" ? (
            <input name="passcode" aria-label="Firm passcode" minLength={4} required autoComplete="off" spellCheck={false} placeholder="At least 4 characters" className="field ml-6 w-[calc(100%-1.5rem)]" />
          ) : null}
          {!firm || firm.hasPasscode ? (
            <label className="flex min-h-10 items-center gap-2">
              <input type="radio" name="access" value="none" checked={access === "none"} onChange={() => setAccess("none")} className="h-4 w-4" />
              No passcode
            </label>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted">The passcode also opens each of the firm&rsquo;s projects from its page.</p>
        {access === "none" || (firm && !firm.hasPasscode && access === "keep") ? (
          <p className="mt-1 text-xs text-negative">Anyone who guesses the address will see all the firm&rsquo;s projects.</p>
        ) : null}
      </fieldset>

      {firm ? (
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="enabled" defaultChecked={firm.enabled} className="h-4 w-4" />
          The firm&rsquo;s page is open
        </label>
      ) : null}
    </ActionForm>
  );
}
