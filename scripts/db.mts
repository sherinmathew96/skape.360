/**
 * Database commands for the hosted (Supabase) database.
 *
 *   npm run db:migrate          create or update the tables
 *   npm run db:seed             create the first admin account
 *   npm run db:seed -- --demo   also add the sample projects
 *   npm run db:check            show tables, accounts and project count
 *
 * The local embedded database needs none of this: it migrates and seeds itself
 * on first start. `npm run db:reset` deletes it.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../src/db/schema";
import { seed } from "../src/db/seed-data";
import type { Db } from "../src/db";

const command = process.argv[2];
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is empty in .env.local. Paste the Supabase connection string first.");
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

try {
  if (command === "migrate") {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Tables are up to date.");
  } else if (command === "seed") {
    await seed(db as unknown as Db, { demo: process.argv.includes("--demo") });
    console.log("Seed finished (skipped if users already exist).");
  } else {
    console.error("Use: migrate | seed");
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
