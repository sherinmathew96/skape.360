/**
 * Checks the Cloudflare R2 setup: the keys work, the bucket accepts files, and
 * browsers on this app's address are allowed to upload (CORS).
 *
 *   npm run r2:check
 *
 * Writes one tiny test file and deletes it again. Prints no secrets.
 */
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, APP_URL } = process.env;
const missing = Object.entries({ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET })
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`Empty in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const ok = (msg: string) => console.log(`  ok    ${msg}`);
const bad = (msg: string, hint: string) => {
  console.log(`  FAIL  ${msg}\n        ${hint}`);
  process.exitCode = 1;
};

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
});
const Key = `_healthcheck/${Date.now()}.txt`;
const Bucket = R2_BUCKET!;

console.log(`Checking bucket "${Bucket}"…`);
try {
  await client.send(new PutObjectCommand({ Bucket, Key, Body: "skape360", ContentType: "text/plain" }));
  ok("keys work and the bucket accepts files");
} catch (err) {
  const name = (err as Error).name;
  bad(
    `could not write to the bucket (${name})`,
    name === "NoSuchBucket"
      ? "Check R2_BUCKET matches the bucket's name exactly."
      : name === "AccessDenied" || name === "Forbidden"
        ? "The API token needs Object Read & Write on this bucket."
        : "Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.",
  );
  process.exit(1);
}

try {
  const head = await client.send(new HeadObjectCommand({ Bucket, Key }));
  if (head.ContentLength === 8) ok("files can be read back");
  else bad("file size did not match", "Try again; if it repeats, recreate the token.");
} catch {
  bad("could not read the file back", "The API token needs Object Read & Write.");
}

// Browser uploads come from the app's address; R2 must allow it.
const origins = [APP_URL?.replace(/\/$/, ""), "http://localhost:3360"].filter(Boolean) as string[];
const putUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key, ContentType: "text/plain" }), { expiresIn: 300 });
for (const origin of origins) {
  const res = await fetch(putUrl, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" },
  });
  const allowed = res.headers.get("access-control-allow-origin");
  if (res.ok && (allowed === origin || allowed === "*")) ok(`browsers on ${origin} may upload`);
  else bad(`browsers on ${origin} may not upload (CORS)`, `Add ${origin} to the bucket's CORS policy, with PUT and GET.`);
}

const getUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket, Key }), { expiresIn: 300 });
const got = await fetch(getUrl);
if (got.ok && (await got.text()) === "skape360") ok("signed download links work");
else bad("signed download link failed", "Check the token has read access.");

await client.send(new DeleteObjectCommand({ Bucket, Key })).catch(() => {});
console.log(process.exitCode ? "\nFix the FAIL lines above, then run this again." : "\nR2 is ready. Restart the app to start storing uploads there.");
