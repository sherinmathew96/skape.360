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
      add(kind ?? "other", KIND_LABEL[kind ?? ""] ?? "Other files", o.size);
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
