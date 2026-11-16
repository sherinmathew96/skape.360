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

type Deploy = { id: string; state: string; at: Date; message: string | null; branch: string | null };

export type VercelHosting =
  | { state: "no-token" }
  | { state: "error"; message: string }
  | { state: "ok"; plan: string | null; region: string | null; usageUrl: string; deploys: Deploy[]; deploysError: string | null };

/** Vercel region codes, written as places. */
const REGIONS: Record<string, string> = {
  iad1: "Washington, USA",
  sfo1: "San Francisco, USA",
  pdx1: "Portland, USA",
  cle1: "Cleveland, USA",
  icn1: "Seoul, South Korea",
  hnd1: "Tokyo, Japan",
  kix1: "Osaka, Japan",
  sin1: "Singapore",
  bom1: "Mumbai, India",
  syd1: "Sydney, Australia",
  hkg1: "Hong Kong",
  fra1: "Frankfurt, Germany",
  lhr1: "London, UK",
  cdg1: "Paris, France",
  arn1: "Stockholm, Sweden",
  dub1: "Dublin, Ireland",
  gru1: "São Paulo, Brazil",
  cpt1: "Cape Town, South Africa",
  dxb1: "Dubai, UAE",
};

export function regionName(code: string | null) {
  if (!code) return null;
  return REGIONS[code] ? `${REGIONS[code]} (${code})` : code;
}

/**
 * What Vercel shares on every plan: the plan, the region the app runs in and
 * the latest production deploys. Usage figures are not in Vercel's API on
 * Hobby, so the card links to Vercel's own usage page for those.
 * Needs VERCEL_API_TOKEN (and VERCEL_TEAM_ID for a team).
 */
export async function vercelHosting(): Promise<VercelHosting> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) return { state: "no-token" };
  const team = process.env.VERCEL_TEAM_ID?.trim();
  const scope = team ? `teamId=${encodeURIComponent(team)}` : "";
  const get = (path: string) =>
    fetch(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}${scope}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Changes only on a deploy: ask Vercel at most every 5 minutes.
      next: { revalidate: 300 },
    });
  const why = async (res: Response) => {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
    const said = (body?.error?.message ?? body?.error?.code ?? "").replace(/\.+$/, "");
    return res.status === 401 || res.status === 403 ? "the token can’t read this account" : `Vercel answered ${res.status}${said ? `: ${said}` : ""}`;
  };
  try {
    // The account: its plan and the address of its usage page.
    let plan: string | null = null;
    let usageUrl = "https://vercel.com/dashboard";
    if (team) {
      const res = await get(`/v2/teams/${encodeURIComponent(team)}`);
      if (!res.ok) return { state: "error", message: await why(res) };
      const t = (await res.json()) as { slug?: string; billing?: { plan?: string } };
      if (t.slug) usageUrl = `https://vercel.com/${t.slug}/~/usage`;
      plan = t.billing?.plan ?? null;
    } else {
      const res = await get("/v2/user");
      if (!res.ok) return { state: "error", message: await why(res) };
      const u = (await res.json()) as { user?: { username?: string; billing?: { plan?: string } } };
      if (u.user?.username) usageUrl = `https://vercel.com/${u.user.username}/~/usage`;
      plan = u.user?.billing?.plan ?? null;
    }

    // The latest production deploys of this project (Vercel tells the app its own project id).
    const project = process.env.VERCEL_PROJECT_ID;
    let deploys: Deploy[] = [];
    let deploysError: string | null = null;
    if (project) {
      const res = await get(`/v6/deployments?projectId=${encodeURIComponent(project)}&target=production&limit=5`);
      if (res.ok) {
        const d = (await res.json()) as {
          deployments?: { uid: string; state?: string; readyState?: string; created: number; meta?: { githubCommitMessage?: string; githubCommitRef?: string } }[];
        };
        deploys = (d.deployments ?? []).map((x) => ({
          id: x.uid,
          state: (x.readyState ?? x.state ?? "UNKNOWN").toUpperCase(),
          at: new Date(x.created),
          message: x.meta?.githubCommitMessage?.split("\n")[0] ?? null,
          branch: x.meta?.githubCommitRef ?? null,
        }));
      } else deploysError = await why(res);
    }

    return { state: "ok", plan, region: process.env.VERCEL_REGION ?? null, usageUrl, deploys, deploysError };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
