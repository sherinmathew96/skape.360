/**
 * Reads a BOQ copied from Excel (or Google Sheets): one row per line, cells
 * separated by tabs. Heads such as "2 EXCAVATION" start a section, numbered
 * rows (2.1, 2.2…) become works, and sub-totals, GST and totals are skipped.
 * A plain list, one milestone per line, works too.
 */

export type BoqRow = {
  section: string;
  code: string | null;
  title: string;
  unit: string | null;
  qty: number | null;
  rate: number | null;
  amount: number | null;
};

const SKIP = /^(sub[\s-]*total|total|grand\s*total|gst|cgst|sgst|igst|net\s*total|carried|brought)\b/i;
const HEADER = /^(sl\.?|s\.?\s*no\.?|sr\.?\s*no\.?|item|no\.?)$/i;
const CODE = /^\d+(\.\d+)+[a-z]?$|^\d+[a-z]$/i;
const LUMP = /^l\.?\s*s\.?$|^lump\s*sum$|^job$/i;

const num = (cell: string | undefined): number | null => {
  if (!cell) return null;
  const clean = cell.replace(/[₹,\s]|rs\.?/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
};

/** "PRELIMINARIES" → "Preliminaries"; mixed case is kept as written. */
const tidy = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t === t.toUpperCase() && /[A-Z]/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t;
};

/** Splits tab-separated text into rows of cells, keeping quoted cells that span lines (as Excel copies them). */
export function splitTsv(text: string, delimiter = "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch === "\n" || ch === "\r" ? " " : ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

export function parseBoq(text: string, startSection = "Works"): BoqRow[] {
  return parseBoqRows(splitTsv(text), { startSection, lists: true });
}

/**
 * Reads rows of cells (from a paste, an Excel sheet or a PDF table). With
 * `lists`, a line of words alone is taken as a work; files leave it off so
 * titles, notes and page footers are not mistaken for works.
 */
export function parseBoqRows(table: string[][], { startSection = "Works", lists = false }: { startSection?: string; lists?: boolean } = {}): BoqRow[] {
  const rows: BoqRow[] = [];
  let section = startSection;

  for (const raw of table) {
    const cells = raw.map((c) => c.replace(/\s+/g, " ").trim());
    while (cells.length && !cells[cells.length - 1]) cells.pop();
    const filled = cells.filter(Boolean);
    if (!filled.length) continue;
    const joined = filled.join(" ");
    if (SKIP.test(filled[0]) || SKIP.test(filled[1] ?? "") || (filled.length <= 3 && SKIP.test(joined))) continue;
    if (HEADER.test(filled[0]) || /^description/i.test(filled[0]) || /description of work/i.test(joined)) continue;
    if (/^bill of quantities/i.test(joined) || /^works up to/i.test(joined)) continue;

    const [first = "", ...rest] = cells;
    const numbers = rest.map(num).filter((n) => n !== null);

    // A section head: "1 PRELIMINARIES", or "1" then "PRELIMINARIES", with no figures.
    const head = first.match(/^(\d+)\.?\s+([A-Za-z].*)$/);
    if (head && numbers.length === 0 && filled.length === 1) {
      section = tidy(head[2]);
      continue;
    }
    if (/^\d+\.?$/.test(first) && numbers.length === 0 && rest.filter(Boolean).length === 1) {
      section = tidy(rest.find(Boolean)!);
      continue;
    }
    // A sub-group such as "a. Site barricading…" with no figures: kept as context, not a work.
    if (/^[a-z][.)]\s/i.test(first) && numbers.length === 0 && filled.length === 1) continue;

    if (CODE.test(first) || (/^\d+$/.test(first) && rest.filter(Boolean).length >= 2)) {
      // An item: Sl, Description, Unit, Qty, Rate, Amount (any of the last four may be blank).
      const [title = "", unit = "", qtyCell = "", rateCell = "", amountCell = ""] = rest;
      if (!title) continue;
      const lump = LUMP.test(unit) || LUMP.test(qtyCell);
      const q = lump ? null : num(qtyCell);
      const r = num(rateCell);
      let a = num(amountCell);
      if (a === null && r !== null) a = lump ? r : q !== null ? Math.round(q * r * 100) / 100 : null;
      rows.push({ section, code: first, title: title.replace(/\s+/g, " "), unit: unit || null, qty: q, rate: r, amount: a });
      continue;
    }

    // Anything else with words and no figures: a milestone, one per line.
    if (lists && filled.length === 1 && /[a-z]/i.test(first) && first.length >= 3) {
      rows.push({ section, code: null, title: first.replace(/\s+/g, " "), unit: null, qty: null, rate: null, amount: null });
    }
  }
  return rows.slice(0, 500);
}

/**
 * Which sheets to add by default: every sheet with numbered items (1.1,
 * 2.3…), so a BOQ split into Foundation and Superstructure sheets comes in
 * whole while a summary sheet (1, 2, 3 with totals) is left out.
 */
export function defaultSheets(sheets: { name: string; rows: string[][] }[]): number[] {
  const parsed = sheets.map((s) => parseBoqRows(s.rows, { startSection: s.name }));
  const dotted = parsed.map((rows, i) => (rows.some((r) => r.code && CODE.test(r.code) && r.code.includes(".")) ? i : -1)).filter((i) => i >= 0);
  if (dotted.length) return dotted;
  const counts = parsed.map((r) => r.length);
  const best = counts.indexOf(Math.max(...counts));
  return best >= 0 && counts[best] > 0 ? [best] : [];
}

/** The works of the chosen sheets, in sheet order; a head repeated on a later sheet gets the sheet's name. */
export function combineSheets(sheets: { name: string; rows: string[][] }[], parsed: BoqRow[][], picked: number[]): BoqRow[] {
  const seen = new Set<string>();
  const out: BoqRow[] = [];
  for (const i of [...picked].sort((a, b) => a - b)) {
    const rows = parsed[i] ?? [];
    const names = new Map<string, string>();
    for (const sec of new Set(rows.map((r) => r.section))) {
      names.set(sec, seen.has(sec) ? `${sec} (${sheets[i].name})` : sec);
    }
    for (const r of rows) out.push({ ...r, section: names.get(r.section)! });
    for (const n of names.values()) seen.add(n);
  }
  return out.slice(0, 500);
}
