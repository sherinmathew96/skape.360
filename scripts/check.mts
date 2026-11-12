// Read-only check of what is in the hosted database. Prints no secrets.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const tables = await sql`select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`;
const users = await sql`select name, email, role, active from users`;
const [{ projects }] = await sql`select count(*)::int as projects from projects`;
console.log("tables:", tables.length, "| with RLS:", tables.filter((t) => t.rowsecurity).length);
console.log("users:", users.map((u) => `${u.name} <${u.email}> ${u.role}`).join("; "));
console.log("projects:", projects);
await sql.end();
