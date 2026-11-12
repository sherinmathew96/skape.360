/**
 * Sets a new sign-in password for one account. Typing is hidden.
 *
 *   npm run db:set-password -- someone@example.com
 *
 * Signs that person out everywhere and clears any lockout.
 */
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { hashPassword } from "../src/lib/password";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Give the account's email: npm run db:set-password -- someone@example.com");
  process.exit(1);
}

/** Reads one line from the terminal without echoing it. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error("Run this in a terminal so the password can be typed hidden."));
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") {
          process.stdout.write("\nCancelled.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        value += ch;
        process.stdout.write("•");
      }
    };
    stdin.on("data", onData);
  });
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const [user] = await sql`select id, name from users where email = ${email}`;
  if (!user) {
    console.error(`No account has the email ${email}.`);
    process.exitCode = 1;
  } else {
    console.log(`Setting a new password for ${user.name} (${email}).`);
    console.log("At least 10 characters.\n");

    let password = "";
    for (;;) {
      password = await askHidden("New password: ");
      if (password.length < 10) {
        console.log("Too short. Use at least 10 characters.\n");
        continue;
      }
      const again = await askHidden("Type it again: ");
      if (again !== password) {
        console.log("Those did not match. Try again.\n");
        continue;
      }
      break;
    }

    await sql.begin(async (tx) => {
      await tx`update users set password_hash = ${await hashPassword(password)} where id = ${user.id}`;
      await tx`delete from sessions where user_id = ${user.id}`;
      await tx`delete from login_attempts where email = ${email}`;
      await tx`insert into audit_log (user_id, action, entity, entity_id) values (${user.id}, 'reset_password', 'user', ${user.id})`;
    });

    // The first-run password in .env.local no longer works; don't leave it lying around.
    try {
      const env = readFileSync(".env.local", "utf8");
      const cleared = env.replace(/^SEED_ADMIN_PASSWORD=.*$/m, "SEED_ADMIN_PASSWORD=");
      if (cleared !== env) writeFileSync(".env.local", cleared);
    } catch {}

    console.log("\nDone. Sign in with the new password. Every other device has been signed out.");
  }
} finally {
  await sql.end();
}
