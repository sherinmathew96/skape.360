/**
 * Reads a BOQ file in the browser and returns its table as rows of cells,
 * for `parseBoqRows`. Nothing is uploaded: the file is read on the device.
 *
 * - Excel (.xlsx): unzipped with the browser's own DecompressionStream and
 *   read from the sheet XML, so no spreadsheet library is needed.
 * - CSV: split on commas.
 * - PDF: the text is pulled out with pdf.js and put back into table rows
 *   by position: the item number column on the left, the description next
 *   to it; quantities and rates are left out.
 */

export type BoqSheet = { name: string; rows: string[][] };

// ── Excel ──────────────────────────────────────────────────────────────────

async function unzip(buffer: ArrayBuffer): Promise<Map<string, () => Promise<string>>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This doesn't look like an Excel file. Save it as .xlsx and try again.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, () => Promise<string>>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.slice(start, start + size);
    files.set(name, async () => {
      if (method === 0) return decoder.decode(data);
      if (method !== 8) throw new Error("This Excel file uses a format that can't be read here. Save it as .xlsx and try again.");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Response(stream).text();
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
const textOf = (el: Element) =>
  Array.from(el.getElementsByTagName("t"))
    .filter((t) => t.parentElement?.localName !== "rPh")
    .map((t) => t.textContent ?? "")
    .join("");

const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const tidyNumber = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== "" ? String(Number(n.toPrecision(12))) : v;
};

export async function readXlsx(file: File): Promise<BoqSheet[]> {
  const files = await unzip(await file.arrayBuffer());
  const get = async (path: string) => (files.has(path) ? xml(await files.get(path)!()) : null);
  const workbook = await get("xl/workbook.xml");
  if (!workbook) throw new Error("This doesn't look like an Excel file. Save it as .xlsx and try again.");
  const rels = await get("xl/_rels/workbook.xml.rels");
  const targets = new Map<string, string>();
  for (const r of Array.from(rels?.getElementsByTagName("Relationship") ?? [])) {
    const target = r.getAttribute("Target") ?? "";
    targets.set(r.getAttribute("Id") ?? "", target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const shared = await get("xl/sharedStrings.xml");
  const strings = shared ? Array.from(shared.getElementsByTagName("si")).map(textOf) : [];

  const sheets: BoqSheet[] = [];
  for (const s of Array.from(workbook.getElementsByTagName("sheet"))) {
    const rid = s.getAttribute("r:id") ?? Array.from(s.attributes).find((a) => a.localName === "id")?.value ?? "";
    const doc = await get(targets.get(rid) ?? "");
    if (!doc) continue;
    const rows: string[][] = [];
    for (const row of Array.from(doc.getElementsByTagName("row"))) {
      const cells: string[] = [];
      for (const c of Array.from(row.getElementsByTagName("c"))) {
        const type = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        const value = type === "s" ? (strings[Number(v)] ?? "") : type === "inlineStr" ? textOf(c) : type === "str" || type === "b" || type === "e" ? v : tidyNumber(v);
        const i = c.getAttribute("r") ? colIndex(c.getAttribute("r")!) : cells.length;
        while (cells.length < i) cells.push("");
        cells[i] = value;
      }
      rows.push(cells);
    }
    sheets.push({ name: s.getAttribute("name") ?? `Sheet ${sheets.length + 1}`, rows });
  }
  return sheets;
}

// ── PDF ────────────────────────────────────────────────────────────────────

type Piece = { x: number; y: number; w: number; h: number; str: string };
type Line = { y: number; pieces: Piece[] };

const CODE = /^[A-Z]{0,2}\d+(\.\d+)+[a-z]?$/i;
/** Heads (1, A1) and groups (A, B: a floor) in the number column. */
const HEAD = /^[A-Z]{0,2}\d+\.?$|^[A-Z]{0,2}\d+\.?\s+[A-Za-z]/;
const GROUP = /^[A-Z]{1,2}[.)]?$|^[A-Z]{1,2}[.)]?\s+[A-Za-z]/;
const NUMERIC = /^[-₹]?[\d,]+(\.\d+)?%?$/;
const UNIT = /^(l\.?\s*s\.?|lump\s*sum|m[²³23]?|sq\.?\s*m|sqm|cum|cu\.?\s*m|cu\.?\s*ft|sq\.?\s*ft|r\.?\s*m\.?|rmt|nos?\.?|no's|bags?|kg|mt|tonnes?|ltrs?|litres?|each|job|sets?|pairs?|day|days|month)$/i;

/** Lines of text, top to bottom across all pages, each with its pieces left to right. */
async function pdfLines(file: File): Promise<{ lines: Line[]; fontSize: number; pageWidth: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: Line[] = [];
  const heights: number[] = [];
  let offset = 0;
  let pageWidth = 0;
  try {
    for (let n = 1; n <= Math.min(doc.numPages, 60); n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      pageWidth = Math.max(pageWidth, vp.width);
      const content = await page.getTextContent();
      const pieces: Piece[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [, , , d, e, f] = item.transform as number[];
        const h = Math.abs(d) || item.height || 10;
        heights.push(h);
        pieces.push({ x: e, y: offset + (vp.height - f), w: item.width, h, str: item.str.trim() });
      }
      pieces.sort((a, b) => a.y - b.y || a.x - b.x);
      const pageLines: Line[] = [];
      for (const piece of pieces) {
        const line = pageLines.find((l) => Math.abs(l.y - piece.y) <= Math.max(2, piece.h * 0.35));
        if (line) line.pieces.push(piece);
        else pageLines.push({ y: piece.y, pieces: [piece] });
      }
      for (const l of pageLines) l.pieces.sort((a, b) => a.x - b.x);
      pageLines.sort((a, b) => a.y - b.y);
      lines.push(...pageLines);
      offset += vp.height + 1000; // keeps pages apart so lines never join across a page break
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  heights.sort((a, b) => a - b);
  return { lines, fontSize: heights[Math.floor(heights.length / 2)] ?? 10, pageWidth };
}

const join = (pieces: Piece[]) => pieces.map((p) => p.str).join(" ").replace(/\s+/g, " ").trim();

export async function readPdf(file: File): Promise<BoqSheet[]> {
  const { lines, fontSize, pageWidth } = await pdfLines(file);
  if (!lines.length) throw new Error("No text found in this PDF. It may be a scan; use the Excel file instead.");

  // Where the columns are: item numbers on the left, figures on the right.
  const codes = lines.flatMap((l) => l.pieces.filter((p) => CODE.test(p.str) || (/^[A-Z]{0,2}\d+$/.test(p.str) && p.x < pageWidth * 0.2)));
  const codeLeft = codes.length ? Math.min(...codes.map((p) => p.x)) : 0;
  const codeRight = codes.length ? Math.max(...codes.filter((p) => p.x < codeLeft + fontSize * 4).map((p) => p.x + p.w)) : 0;
  // The figures start at the "Unit" / "Qty" heading when there is one; otherwise at the first figure on the right half.
  const heading = lines.flatMap((l) => l.pieces).find((p) => /^(unit|qty\.?|quantity)$/i.test(p.str) && p.x > pageWidth * 0.4);
  const figures = lines.flatMap((l) => l.pieces.filter((p) => p.x > pageWidth * 0.5 && (NUMERIC.test(p.str) || UNIT.test(p.str))));
  const figuresLeft = heading ? heading.x - fontSize * 1.5 : figures.length ? Math.min(...figures.map((p) => p.x)) - 2 : Infinity;

  type Row = { y: number; top: number; bottom: number; code: string; desc: string; figures: boolean };
  const rows: Row[] = lines.map((l) => {
    const left = l.pieces.filter((p) => p.x + 1 < codeRight + fontSize * 0.5 && p.x < codeLeft + fontSize * 4);
    const right = l.pieces.filter((p) => p.x >= figuresLeft && (NUMERIC.test(p.str) || UNIT.test(p.str)));
    const middle = l.pieces.filter((p) => !left.includes(p) && !right.includes(p));
    return { y: l.y, top: l.y - fontSize, bottom: l.y, code: join(left), desc: join(middle), figures: right.length > 0 };
  });

  // Rows that start something: an item number, a head ("2 EXCAVATION"), a sub-total.
  const isAnchor = (r: Row) => CODE.test(r.code) || HEAD.test(r.code) || GROUP.test(r.code) || /^[a-z][.)]$/.test(r.code) || /^(sub[\s-]*total|total|gst)/i.test(r.desc);
  const loose = (r: Row) => !r.code && !r.figures && !!r.desc;

  // Blocks of lines close together belong to one table row (a wrapped description).
  const gap = fontSize * 1.45;
  const blocks: Row[][] = [];
  for (const r of rows) {
    const last = blocks.at(-1);
    if (last && r.y - last.at(-1)!.y <= gap) last.push(r);
    else blocks.push([r]);
  }

  const out: string[][] = [];
  let lastItem: string[] | null = null;
  for (const block of blocks) {
    const anchors = block.filter(isAnchor);
    if (anchors.length === 0) {
      // A description that ran on past the row (or onto a new page).
      const extra = block.filter(loose).map((r) => r.desc).join(" ");
      if (lastItem && extra && !/^(page \d|bill of quantities|description)/i.test(extra)) lastItem[1] = `${lastItem[1]} ${extra}`.trim();
      continue;
    }
    // Each loose line goes to the nearest row-starting line in its block.
    const extras = new Map<Row, Row[]>(anchors.map((a) => [a, []]));
    for (const r of block) {
      if (!loose(r) || isAnchor(r)) continue;
      const near = anchors.reduce((best, a) => (Math.abs(a.y - r.y) < Math.abs(best.y - r.y) ? a : best));
      extras.get(near)!.push(r);
    }
    for (const a of anchors) {
      const parts = [a, ...extras.get(a)!].sort((x, y) => x.y - y.y).map((r) => r.desc).filter(Boolean);
      const desc = parts.join(" ").replace(/\s+/g, " ").trim();
      if (CODE.test(a.code) || (/^[A-Z]{0,2}\d+$/.test(a.code) && a.figures)) {
        lastItem = [a.code, desc];
        out.push(lastItem);
      } else if (HEAD.test(a.code) || GROUP.test(a.code)) {
        lastItem = null;
        out.push(desc ? [a.code, desc] : [a.code]);
      } else {
        // A sub-group ("a. Site works") or a sub-total: not a work.
        lastItem = null;
        out.push([`${a.code} ${desc}`.trim()]);
      }
    }
  }
  return [{ name: file.name, rows: out }];
}

export async function readCsv(file: File): Promise<BoqSheet[]> {
  const { splitTsv } = await import("./boq");
  const text = await file.text();
  const delimiter = text.split("\n", 1)[0].includes("\t") ? "\t" : text.split("\n", 1)[0].includes(";") ? ";" : ",";
  return [{ name: file.name, rows: splitTsv(text, delimiter) }];
}

/** Reads an .xlsx, .csv or .pdf BOQ into sheets of rows. */
export async function readBoqFile(file: File): Promise<BoqSheet[]> {
  const name = file.name.toLowerCase();
  if (file.size > 20 * 1024 * 1024) throw new Error("That file is over 20 MB. Use the BOQ sheet on its own.");
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) return readXlsx(file);
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) return readCsv(file);
  if (name.endsWith(".pdf")) return readPdf(file);
  if (name.endsWith(".xls")) throw new Error("Old .xls files can't be read. In Excel, use Save As → Excel Workbook (.xlsx), then upload that.");
  throw new Error("Upload an Excel (.xlsx), CSV or PDF file.");
}
