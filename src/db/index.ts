import "server-only";
import path from "node:path";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * One database handle for the whole app.
 *
 * - DATABASE_URL set  → Postgres (Supabase). Run `npm run db:migrate` once.
 * - DATABASE_URL empty → an embedded Postgres (PGlite) stored in .data/pglite,
 *   migrated and seeded on first start, so the app runs with no accounts.
 *
 * Both drivers speak the same SQL through Drizzle, so the type of one stands
 * in for the other.
 */
export type Db = PgliteDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __skapeDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  // USE_LOCAL_DB=1 forces the embedded database, e.g. for testing without touching real data.
  if (url && !process.env.USE_LOCAL_DB) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { attachDatabasePool } = await import("@vercel/functions");
    // Vercel pauses the function between visits and Supabase's pooler drops
    // idle connections meanwhile; a query sent down such a dead connection
    // hangs or fails. Idle connections close after 5 s, and on Vercel
    // attachDatabasePool keeps the function awake until they have, so a
    // paused function never holds one. Unnamed queries suit the
    // transaction pooler (no prepared statements).
    const pool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
      maxLifetimeSeconds: 60 * 5,
    });
    // A connection dropped while idle must not crash the process.
    pool.on("error", (err) => console.warn("[skape360] idle database connection closed:", err.message));
    attachDatabasePool(pool);
    return drizzle(pool, { schema }) as unknown as Db;
  }

  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_DB) {
    throw new Error(
      "DATABASE_URL is not set. Add the Supabase connection string before deploying.",
    );
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const { mkdir, rename } = await import("node:fs/promises");
  const dir = path.join(process.cwd(), ".data", "pglite");

  const open = async () => {
    await mkdir(dir, { recursive: true });
    const pg = new PGlite(dir);
    await pg.waitReady;
    return pg;
  };

  // The local database is for trying the app out. If the dev server was
  // killed mid-write it can fail to open; set it aside and start fresh
  // rather than leave the app unusable. Real data belongs in DATABASE_URL.
  let client;
  try {
    client = await open();
  } catch {
    const aside = `${dir}-broken-${Date.now()}`;
    await rename(dir, aside);
    console.warn(`[skape360] Local database could not be opened. Moved it to ${aside} and created a new one with sample data.`);
    client = await open();
  }

  const close = () => void client.close().finally(() => process.exit(0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);

  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  const { seed } = await import("./seed-data");
  await seed(db, { demo: true });
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__skapeDb) {
    globalForDb.__skapeDb = connect().catch((err) => {
      globalForDb.__skapeDb = undefined;
      throw err;
    });
  }
  return globalForDb.__skapeDb;
}

export { schema };
