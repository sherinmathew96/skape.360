import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

/**
 * Where uploaded files live.
 *
 * - R2_* variables set → Cloudflare R2. The browser uploads straight to R2
 *   with a short-lived signed URL, and downloads the same way, so large
 *   models never pass through the app server.
 * - Otherwise → .data/uploads on this computer, for development only.
 */

const r2Config = () => {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return { accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET };
};

// USE_LOCAL_STORAGE=1 keeps files on this computer, e.g. for testing without touching R2.
export const storageDriver = (): "r2" | "local" => (r2Config() && !process.env.USE_LOCAL_STORAGE ? "r2" : "local");

function assertLocalAllowed() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_DB) {
    throw new Error("File storage is not set up. Add the R2_* settings before deploying.");
  }
}

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");
const WINDOW = 12 * 60 * 60 * 1000;
const localPath = (key: string) => {
  const full = path.join(LOCAL_ROOT, key);
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Bad storage key");
  return full;
};

let s3Promise: Promise<{
  client: import("@aws-sdk/client-s3").S3Client;
  mod: typeof import("@aws-sdk/client-s3");
  presign: typeof import("@aws-sdk/s3-request-presigner").getSignedUrl;
  bucket: string;
}> | null = null;

function s3() {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured");
  s3Promise ??= (async () => {
    const mod = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = new mod.S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
    return { client, mod, presign: getSignedUrl, bucket: cfg.bucket };
  })();
  return s3Promise;
}

/** Where the browser should PUT the file's bytes. */
export async function uploadTarget(fileId: string, key: string, contentType: string): Promise<string> {
  if (storageDriver() === "local") {
    assertLocalAllowed();
    return `/api/uploads/${fileId}`;
  }
  const { client, mod, presign, bucket } = await s3();
  return presign(client, new mod.PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
    expiresIn: 60 * 60,
  });
}

/** Size in bytes of the stored object, or null when it is missing. */
export async function storedSize(key: string): Promise<number | null> {
  if (storageDriver() === "local") {
    try {
      return (await stat(localPath(key))).size;
    } catch {
      return null;
    }
  }
  const { client, mod, bucket } = await s3();
  try {
    const head = await client.send(new mod.HeadObjectCommand({ Bucket: bucket, Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

/** Local driver only: write the request body to disk, refusing anything over maxBytes. */
export async function writeLocal(key: string, body: WebReadableStream<Uint8Array>, maxBytes: number) {
  assertLocalAllowed();
  const target = localPath(key);
  const temp = `${target}.part`;
  await mkdir(path.dirname(target), { recursive: true });
  let seen = 0;
  const limited = Readable.fromWeb(body).on("data", (chunk: Buffer) => {
    seen += chunk.length;
    if (seen > maxBytes) limited.destroy(new Error("File is larger than declared"));
  });
  try {
    await pipeline(limited, createWriteStream(temp));
    await rename(temp, target);
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
  return seen;
}

/**
 * A response that serves the file: a redirect to a short-lived R2 link, or
 * the bytes from disk.
 */
export async function serveFile(file: { storageKey: string; name: string; contentType: string; size: number }) {
  const disposition = `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`;

  if (storageDriver() === "r2") {
    const { client, mod, presign, bucket } = await s3();
    const url = await presign(
      client,
      new mod.GetObjectCommand({
        Bucket: bucket,
        Key: file.storageKey,
        ResponseContentType: file.contentType,
        ResponseContentDisposition: disposition,
        ResponseCacheControl: "private, max-age=43200, immutable",
      }),
      // Signed at the start of a 12-hour window, so the link is the same all
      // window long and the browser can reuse a model it already downloaded.
      { expiresIn: 24 * 60 * 60, signingDate: new Date(Math.floor(Date.now() / WINDOW) * WINDOW) },
    );
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, max-age=3600" } });
  }

  const full = localPath(file.storageKey);
  const stream = Readable.toWeb(createReadStream(full)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function deleteStored(key: string) {
  if (storageDriver() === "local") {
    await rm(localPath(key), { force: true });
    return;
  }
  const { client, mod, bucket } = await s3();
  await client.send(new mod.DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
