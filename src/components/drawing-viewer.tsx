"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Minus, Plus } from "lucide-react";

const ZOOMS = [1, 1.5, 2, 3];
// Phones run out of memory on huge canvases; cap each page's pixels.
const MAX_PIXELS = 16_000_000;

/**
 * Shows a drawing sheet. PDFs are drawn page by page (so they work on phones,
 * which can't show PDFs inline); images are shown as they are.
 */
export function DrawingViewer({ src, contentType, title }: { src: string; contentType: string; title: string }) {
  const isPdf = contentType === "application/pdf";
  const frame = useRef<HTMLDivElement>(null);
  const pagesEl = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const docRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);

  // Load the PDF once per file.
  useEffect(() => {
    if (!isPdf) return;
    let alive = true;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ url: src, withCredentials: false }).promise;
        if (!alive) return void doc.destroy();
        docRef.current = doc;
        setPageCount(doc.numPages);
      } catch {
        if (alive) setState("failed");
      }
    })();
    return () => {
      alive = false;
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [src, isPdf]);

  // Draw every page at the frame's width times the zoom.
  useEffect(() => {
    const doc = docRef.current;
    const host = pagesEl.current;
    const box = frame.current;
    if (!doc || !host || !box || pageCount === null) return;
    let cancelled = false;
    const tasks: { cancel: () => void }[] = [];

    (async () => {
      setState("loading");
      const width = box.clientWidth * ZOOMS[zoom];
      const canvases: HTMLCanvasElement[] = [];
      try {
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const cssScale = width / base.width;
          let pxScale = cssScale * Math.min(window.devicePixelRatio || 1, 2);
          const area = base.width * base.height * pxScale * pxScale;
          if (area > MAX_PIXELS) pxScale *= Math.sqrt(MAX_PIXELS / area);
          const viewport = page.getViewport({ scale: pxScale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(width)}px`;
          canvas.style.height = `${Math.floor((base.height * width) / base.width)}px`;
          canvas.className = "block bg-white";
          canvas.setAttribute("aria-label", `${title}, page ${n} of ${doc.numPages}`);
          canvas.setAttribute("role", "img");
          const task = page.render({ canvas, viewport });
          tasks.push(task);
          await task.promise;
          canvases.push(canvas);
        }
        if (cancelled) return;
        host.replaceChildren(...canvases);
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      tasks.forEach((t) => t.cancel());
    };
  }, [pageCount, zoom, title]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2">
        <p className="num text-xs text-muted">
          {isPdf ? (pageCount ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}` : "Loading…") : "Image"}
        </p>
        <div className="flex items-center gap-1">
          {isPdf ? (
            <>
              <button type="button" className="btn btn-quiet h-9 w-9 p-0" aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom((z) => z - 1)}>
                <Minus size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
              <span className="num w-12 text-center text-xs text-muted" aria-live="polite">{Math.round(ZOOMS[zoom] * 100)}%</span>
              <button type="button" className="btn btn-quiet h-9 w-9 p-0" aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => z + 1)}>
                <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </>
          ) : null}
          <a href={src} target="_blank" rel="noreferrer" className="btn btn-quiet h-9 text-xs">
            <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" /> Full size
          </a>
        </div>
      </div>
      <div ref={frame} className="relative max-h-[75vh] min-h-64 overflow-auto bg-[#e9e8e5]">
        {isPdf ? (
          <div ref={pagesEl} className="flex w-max min-w-full flex-col items-center gap-2" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={title} className="block w-full bg-white" onLoad={() => setState("ready")} onError={() => setState("failed")} />
        )}
        {state === "loading" && isPdf ? (
          <p className="absolute inset-0 flex items-center justify-center text-muted" role="status">Loading drawing…</p>
        ) : null}
        {state === "failed" ? (
          <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-muted">
            This drawing could not be shown here. Use Full size to open it.
          </p>
        ) : null}
      </div>
    </div>
  );
}
