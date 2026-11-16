import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { listStoredObjects, storageDriver } from "./storage";

/** What the database holds: its size on disk and its largest tables. */
export async function databaseUsage() {
  const db = await getDb();
  const local = Boolean(process.env.USE_LOCAL_DB) || !process.env.DATABASE_URL;
  const size = await db.execute<{ bytes: string | number }>(sql`select pg_database_size(current_database()) as bytes`);
  const tables = await db.execute<{ name: string; bytes: string | number; rows: string | number }>(sql`
    select c.relname as name,
           pg_total_relation_size(c.oid) as bytes,
           greatest(coalesce(st.n_live_tup, 0), c.reltuples::bigint, 0) as rows
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_user_tables st on st.relid = c.oid
     where n.nspname = 'public' and c.relkind = 'r'
     order by pg_total_relation_size(c.oid) desc
     limit 8`);
  const first = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? []));
  const sizeRow = first(size)[0] as { bytes: string | number } | undefined;
  return {
    provider: local ? "Local test database" : "Supabase Postgres",
    bytes: Number(sizeRow?.bytes ?? 0),
    tables: (first(tables) as { name: string; bytes: string | number; rows: string | number }[]).map((t) => ({
      name: t.name,
      bytes: Number(t.bytes),
      rows: Number(t.rows),
    })),
  };
}

const KIND_LABEL: Record<string, string> = {
  model: "3D models",
  panorama: "360° photos",
  drawing: "Drawings",
  photo: "Photos",
  receipt: "Receipts and bills",
  render: "Renders",
  cover: "Cover images",
};

/** What file storage holds: every object in the bucket, grouped by kind. */
export async function storageUsage() {
  const objects = await listStoredObjects();
  const groups = new Map<string, { label: string; bytes: number; count: number }>();
  const add = (key: string, label: string, bytes: number) => {
    const g = groups.get(key) ?? { label, bytes: 0, count: 0 };
    g.bytes += bytes;
    g.count += 1;
    groups.set(key, g);
  };
  for (const o of objects) {
    if (o.key.startsWith("derived/")) add("derived", "Phone-sized copies", o.size);
    else {
      // projects/<project>/<kind>/<file> or studio/<kind>/<file>
      const parts = o.key.split("/");
      const kind = parts[0] === "projects" ? parts[2] : parts[1];
      // Folders without a name of their own all count as one "Other files" group.
      const known = kind && KIND_LABEL[kind] ? kind : null;
      add(known ?? "other", known ? KIND_LABEL[known] : "Other files", o.size);
    }
  }
  return {
    provider: storageDriver() === "r2" ? "Cloudflare R2" : "Local test folder",
    bytes: objects.reduce((n, o) => n + o.size, 0),
    count: objects.length,
    groups: [...groups.values()].sort((a, b) => b.bytes - a.bytes),
  };
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

type VercelService = { name: string; used: string; limit: string | null; pct: number | null; cost: number };

export type VercelUsage =
  | { state: "no-token" }
  | { state: "error"; message: string }
  | { state: "ok"; from: Date; to: Date; cost: number; services: VercelService[] };

/**
 * Hobby allowances as Vercel's usage page shows them, by product name, so the
 * figures read as "used / allowed". Products not listed show the amount only.
 */
const HOBBY_LIMITS: Record<string, { amount: number; unit: "bytes" | "count" | "seconds" | "gbhours" }> = {
  "Functions Storage": { amount: 10 * 1024 ** 3, unit: "bytes" },
  "Fluid Active CPU": { amount: 4 * 3600, unit: "seconds" },
  "Deployment Storage": { amount: 10 * 1024 ** 3, unit: "bytes" },
  "CDN Requests": { amount: 1_000_000, unit: "count" },
  "Edge Requests": { amount: 1_000_000, unit: "count" },
  "Function Invocations": { amount: 1_000_000, unit: "count" },
  "Fluid Provisioned Memory": { amount: 360, unit: "gbhours" },
  "Fast Origin Transfer": { amount: 10 * 1024 ** 3, unit: "bytes" },
  "CDN Request CPU Duration": { amount: 3600, unit: "seconds" },
  "Fast Data Transfer": { amount: 100 * 1024 ** 3, unit: "bytes" },
};

type CostMetric = { slug: string; title?: string; unit?: { kind?: string; name?: string; singular?: string; plural?: string } };
type CostGroup = { dimensionValues: { product?: string }; metrics: string[]; totalValue: number[] };
type CostResponse = {
  metrics?: CostMetric[];
  results?: { views?: Record<string, { results?: CostGroup[] }>; dimensionsMeta?: { product?: { values?: Record<string, { title?: string }> } } };
};

const BYTE_UNITS: Record<string, number> = { b: 1, byte: 1, bytes: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 };
const SECOND_UNITS: Record<string, number> = { ms: 0.001, millisecond: 0.001, milliseconds: 0.001, s: 1, sec: 1, second: 1, seconds: 1, min: 60, minute: 60, minutes: 60, h: 3600, hr: 3600, hour: 3600, hours: 3600 };
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function duration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** A quantity in its own unit, written the way Vercel's usage page writes it, and its share of the Hobby allowance. */
function describe(name: string, quantity: number, metric: CostMetric | undefined) {
  const raw = (metric?.unit?.name ?? metric?.unit?.plural ?? "").trim();
  const u = raw.toLowerCase();
  const limit = HOBBY_LIMITS[name];
  let used: string;
  let base: number;
  if (metric?.unit?.kind === "digitalStorage" || u in BYTE_UNITS) {
    base = quantity * (BYTE_UNITS[u] ?? 1);
    used = formatBytes(base);
  } else if (u in SECOND_UNITS) {
    base = quantity * SECOND_UNITS[u];
    used = duration(base);
  } else if (/gb.?h/i.test(raw)) {
    base = quantity;
    used = `${quantity.toFixed(1)} GB-Hrs`;
  } else {
    base = quantity;
    used = `${compact.format(quantity)}${raw && !/request|invocation|count/i.test(raw) ? ` ${raw}` : ""}`;
  }
  if (!limit) return { used, limit: null, pct: null };
  const lim =
    limit.unit === "bytes" ? formatBytes(limit.amount) : limit.unit === "seconds" ? duration(limit.amount) : limit.unit === "gbhours" ? `${limit.amount} GB-Hrs` : compact.format(limit.amount);
  return { used, limit: lim, pct: Math.min(100, (base / limit.amount) * 100) };
}

/**
 * Hosting use over the last 30 days, product by product, read the way the
 * `vercel usage` command reads it (POST /v2/billing/costs), which also works
 * on Hobby. Needs VERCEL_API_TOKEN, and VERCEL_TEAM_ID for a team.
 */
export async function vercelUsage(): Promise<VercelUsage> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) return { state: "no-token" };
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
  const team = process.env.VERCEL_TEAM_ID?.trim();
  try {
    const res = await fetch(`https://api.vercel.com/v2/billing/costs${team ? `?teamId=${encodeURIComponent(team)}` : ""}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: from.toISOString(),
        to: to.toISOString(),
        metrics: ["gross_cost", "quantity"],
        format: "timeseries",
        views: { byProduct: { groupBy: ["product"] } },
      }),
      // Usage moves slowly: ask Vercel at most every 10 minutes.
      next: { revalidate: 600 },
    });
    if (!res.ok) {
      // Vercel says why in { error: { code, message } }.
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      const said = (body?.error?.message ?? body?.error?.code ?? "").replace(/\.+$/, "");
      const why = res.status === 401 || res.status === 403 ? "the token can’t read usage for this account" : `Vercel answered ${res.status}`;
      return { state: "error", message: said ? `${why}. Vercel says: ${said}` : why };
    }
    const data = (await res.json()) as CostResponse;
    const titles = data.results?.dimensionsMeta?.product?.values ?? {};
    const byName = new Map<string, { quantity: number; cost: number; metric?: CostMetric }>();
    for (const g of data.results?.views?.byProduct?.results ?? []) {
      const id = g.dimensionValues?.product;
      if (!id) continue;
      const name = titles[id]?.title ?? id;
      const ci = g.metrics.indexOf("gross_cost");
      const qi = g.metrics.findIndex((m) => m !== "gross_cost");
      const item = byName.get(name) ?? { quantity: 0, cost: 0, metric: data.metrics?.find((m) => m.slug === g.metrics[qi]) };
      item.cost += ci === -1 ? 0 : Number(g.totalValue[ci] ?? 0) || 0;
      item.quantity += qi === -1 ? 0 : Number(g.totalValue[qi] ?? 0) || 0;
      byName.set(name, item);
    }
    const services = [...byName.entries()]
      .map(([name, s]) => ({ name, cost: s.cost, ...describe(name, s.quantity, s.metric) }))
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.cost - a.cost);
    return { state: "ok", from, to, cost: services.reduce((n, s) => n + s.cost, 0), services };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
