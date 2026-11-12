// Clears failed sign-in attempts for one email: npm run db:unlock -- someone@example.com
import postgres from "postgres";
const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) { console.error("Give the email: npm run db:unlock -- someone@example.com"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const rows = await sql`delete from login_attempts where email = ${email} returning id`;
console.log(`Cleared ${rows.length} failed attempts for ${email}.`);
await sql.end();
