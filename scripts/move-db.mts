/**
 * Copies the whole database from DATABASE_URL (old) to NEW_DATABASE_URL (new),
 * for moving the hosted database to another region.
 *
 *   npx tsx --env-file=.env.local scripts/move-db.mts
 *
 * 1. Creates the tables on the new database (the app's migrations).
 * 2. Empties the new database's tables, so the copy can be run again.
 * 3. Copies every table, parents before children, with COPY.
 * 4. Moves sequences on, then compares row counts table by table.
 * The old database is only read, never changed.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { pipeline } from "node:stream/promises";

const OLD = process.env.DATABASE_URL;
const NEW = process.env.NEW_DATABASE_URL;
if (!OLD || !NEW) throw new Error("DATABASE_URL and NEW_DATABASE_URL must both be set in .env.local.");
const host = (u: string) => new URL(u).hostname + ":" + new URL(u).port + new URL(u).username;
if (host(OLD) === host(NEW)) throw new Error("NEW_DATABASE_URL points at the same database as DATABASE_URL.");

const src = postgres(OLD, { prepare: false, max: 1 });
const dst = postgres(NEW, { prepare: false, max: 1 });
const t0 = Date.now();

try {
  // 1. Tables on the new database.
  await migrate(drizzle(dst), { migrationsFolder: "./drizzle" });
  console.log("tables ready on the new database");

  // The tables to copy: every table in public on the new side (the old side must have them too).
  const tables = (await dst`select tablename as name from pg_tables where schemaname = 'public' order by tablename`).map((r) => r.name as string);
  const oldTables = new Set((await src`select tablename as name from pg_tables where schemaname = 'public'`).map((r) => r.name as string));
  const missing = tables.filter((t) => !oldTables.has(t));
  const extra = [...oldTables].filter((t) => !tables.includes(t));
  if (missing.length) console.log("only on the new side (left empty):", missing.join(", "));
  if (extra.length) throw new Error(`tables only on the old side: ${extra.join(", ")}. Run db:migrate on the old database first.`);

  // 2. Parents before children, from the foreign keys.
  const fks = await dst`
    select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
     where c.contype = 'f' and n.nspname = 'public'`;
  const strip = (s: string) => s.replace(/^public\./, "").replace(/"/g, "");
  const parents = new Map<string, Set<string>>(tables.map((t) => [t, new Set()]));
  for (const f of fks) {
    const child = strip(f.child as string);
    const parent = strip(f.parent as string);
    if (child !== parent) parents.get(child)?.add(parent);
  }
  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < tables.length) {
    const next = tables.filter((t) => !done.has(t) && [...(parents.get(t) ?? [])].every((p) => done.has(p) || !parents.has(p)));
    if (next.length === 0) throw new Error(`foreign keys form a loop between: ${tables.filter((t) => !done.has(t)).join(", ")}`);
    for (const t of next) {
      order.push(t);
      done.add(t);
    }
  }

  // 3. Empty the new side, then copy each table.
  await dst.unsafe(`truncate ${tables.map((t) => `"${t}"`).join(", ")} restart identity cascade`);
  for (const t of order) {
    const cols = (
      await dst`select attname from pg_attribute where attrelid = ${`public."${t}"`}::regclass and attnum > 0 and not attisdropped and attgenerated = '' order by attnum`
    ).map((r) => `"${r.attname as string}"`);
    if (!oldTables.has(t)) continue;
    const list = cols.join(", ");
    const readable = await src.unsafe(`copy "${t}" (${list}) to stdout`).readable();
    const writable = await dst.unsafe(`copy "${t}" (${list}) from stdin`).writable();
    await pipeline(readable, writable);
  }

  // 4. Sequences (identity and serial columns), then counts.
  const seqs = await dst`
    select s.relname as seq, t.relname as tbl, a.attname as col
      from pg_class s
      join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
      join pg_class t on t.oid = d.refobjid
      join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
      join pg_namespace n on n.oid = s.relnamespace
     where s.relkind = 'S' and n.nspname = 'public'`;
  for (const s of seqs) {
    await dst.unsafe(`select setval('"${s.seq}"', coalesce((select max("${s.col}") from "${s.tbl}"), 0) + 1, false)`);
  }

  let bad = 0;
  let total = 0;
  for (const t of order) {
    if (!oldTables.has(t)) continue;
    const [a] = await src.unsafe(`select count(*)::int as n from "${t}"`);
    const [b] = await dst.unsafe(`select count(*)::int as n from "${t}"`);
    total += b.n;
    if (a.n !== b.n) {
      bad++;
      console.log(`MISMATCH ${t}: old ${a.n}, new ${b.n}`);
    }
  }
  console.log(`${order.length} tables, ${total} rows copied, ${seqs.length} sequences set, ${bad ? `${bad} MISMATCHES` : "all counts match"} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (bad) process.exitCode = 1;
} finally {
  await src.end();
  await dst.end();
}
