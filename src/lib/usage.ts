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

export type VercelUsage =
  | { state: "no-token" }
  | { state: "error"; message: string }
  | {
      state: "ok";
      from: Date;
      to: Date;
      cost: number;
      services: { name: string; unit: string | null; quantity: number; cost: number }[];
    };

/**
 * This month's hosting use from Vercel's billing API (FOCUS charges, one row
 * per product per day), added up by product. Needs VERCEL_API_TOKEN, and
 * VERCEL_TEAM_ID when the project sits in a team.
 */
export async function vercelUsage(): Promise<VercelUsage> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) return { state: "no-token" };
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const ask = (teamId?: string) => {
    const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    if (teamId) q.set("teamId", teamId.trim());
    return fetch(`https://api.vercel.com/v1/billing/charges?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Billing data moves daily: no need to ask Vercel on every visit.
      next: { revalidate: 600 },
    });
  };
  try {
    let res = await ask(process.env.VERCEL_TEAM_ID);
    // A team id the token doesn't know: try the token's own account.
    if (res.status === 404 && process.env.VERCEL_TEAM_ID) res = await ask();
    if (!res.ok) {
      // Vercel says why in { error: { code, message } }.
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      const said = body?.error?.message ?? body?.error?.code;
      const why =
        res.status === 401 || res.status === 403
          ? "the token can't read billing for this account"
          : res.status === 404
            ? "Vercel has no billing data for this account (billing data may only be available on paid plans)"
            : `Vercel answered ${res.status}`;
      return { state: "error", message: said ? `${why}. Vercel says: ${said}` : why };
    }
    const byService = new Map<string, { name: string; unit: string | null; quantity: number; cost: number }>();
    let cost = 0;
    for (const line of (await res.text()).split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as { ServiceName?: string; ConsumedUnit?: string | null; ConsumedQuantity?: number | string | null; BilledCost?: number | string };
      const name = row.ServiceName ?? "Other";
      const unit = row.ConsumedUnit ?? null;
      const key = `${name}|${unit ?? ""}`;
      const item = byService.get(key) ?? { name, unit, quantity: 0, cost: 0 };
      item.quantity += Number(row.ConsumedQuantity ?? 0) || 0;
      item.cost += Number(row.BilledCost ?? 0) || 0;
      cost += Number(row.BilledCost ?? 0) || 0;
      byService.set(key, item);
    }
    const services = [...byService.values()].sort((a, b) => b.cost - a.cost || b.quantity - a.quantity);
    return { state: "ok", from, to: now, cost, services };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
