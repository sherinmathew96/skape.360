"use client";

import { useState } from "react";
import { Box } from "lucide-react";
import type { VisualModel } from "@/lib/visuals";
import { VisualModal } from "./client-visuals";

/**
 * The client's 3D models as small cards with a still of each model. A card
 * opens the model full screen (with comments); the others are a tap away there.
 */
export function ModelGallery({ models, slug, fileBase }: { models: VisualModel[]; slug: string; fileBase: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {models.map((m, i) => (
          <li key={m.id} id={`m-${m.id}`} className="scroll-mt-6">
            <button type="button" onClick={() => setOpen(i)} className="card group block w-full overflow-hidden text-left" aria-label={`Open the 3D model ${m.title}`}>
              <span className="relative block aspect-[4/3] overflow-hidden bg-gradient-to-br from-[#f6f7fb] to-[#eceefa]">
                {m.coverFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${fileBase}${m.coverFileId}?w=640`}
                    alt=""
                    width={320}
                    height={240}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
                  />
                ) : (
                  <Box size={36} strokeWidth={1.2} aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#9197b3]" />
                )}
                <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-text shadow-sm" aria-hidden="true">
                  <Box size={12} strokeWidth={2} />
                  3D
                </span>
              </span>
              <span className="block truncate px-3 py-2.5 text-sm font-medium group-hover:text-primary">{m.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? (
        <VisualModal
          title="3D models"
          visuals={{ models, tours: [], renders: [] }}
          kind="model"
          startIndex={open}
          fileBase={fileBase}
          slug={slug}
          onKind={() => {}}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
