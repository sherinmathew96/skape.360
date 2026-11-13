import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
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

async function readStored(key: string): Promise<Buffer> {
  if (storageDriver() === "local") return readFile(localPath(key));
  const { client, mod, bucket } = await s3();
  const out = await client.send(new mod.GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await out.Body!.transformToByteArray());
}

async function writeStored(key: string, body: Buffer, contentType: string) {
  if (storageDriver() === "local") {
    const target = localPath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return;
  }
  const { client, mod, bucket } = await s3();
  await client.send(new mod.PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

/** The widths an image may be asked for, so only a few copies are ever made. */
export const IMAGE_WIDTHS = [2048, 4096, 8192] as const;

/** `?w=4096` on a file link, when it is one of the allowed widths. */
export function requestedWidth(req: Request): number | undefined {
  const w = Number(new URL(req.url).searchParams.get("w"));
  return (IMAGE_WIDTHS as readonly number[]).includes(w) ? w : undefined;
}

/**
 * A copy of a large image no wider than `width`, made once and kept beside
 * the original. Phones can't open very large 360° photos: they run out of
 * memory, or the picture is wider than the graphics chip can show. Returns
 * null when the original is already small enough.
 */
async function fittedImage(file: { storageKey: string; name: string; contentType: string; id?: string }, width: number) {
  const key = `derived/w${width}/${file.storageKey}.jpg`;
  const copy = { storageKey: key, name: file.name.replace(/\.[^.]+$/, "") + `-${width}.jpg`, contentType: "image/jpeg" };
  const known = await storedSize(key);
  if (known !== null) return known > 0 ? { ...copy, size: known } : null;

  const sharp = (await import("sharp")).default;
  const original = await readStored(file.storageKey);
  const image = sharp(original, { limitInputPixels: 30000 * 15000 });
  const meta = await image.metadata();
  if (!meta.width || meta.width <= width) {
    // Remember that this one needs no copy, so it isn't decoded again.
    await writeStored(key, Buffer.alloc(0), "image/jpeg");
    return null;
  }
  const body = await image.rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  await writeStored(key, body, "image/jpeg");
  return { ...copy, size: body.length };
}

/**
 * A response that serves the file: a redirect to a short-lived R2 link, or
 * the bytes from disk. With `width`, an image is served no wider than that.
 */
export async function serveFile(file: { storageKey: string; name: string; contentType: string; size: number }, opts: { width?: number } = {}) {
  if (opts.width && file.contentType.startsWith("image/")) {
    try {
      const fitted = await fittedImage(file, opts.width);
      if (fitted) return serveFile(fitted);
    } catch (err) {
      // A copy that can't be made should not stop the original from showing.
      console.warn("[skape360] could not resize image:", err instanceof Error ? err.message : err);
    }
  }
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

/** Every stored object with its size: the whole R2 bucket, or the local uploads folder. */
export async function listStoredObjects(): Promise<{ key: string; size: number }[]> {
  if (storageDriver() === "local") {
    const { readdir } = await import("node:fs/promises");
    const out: { key: string; size: number }[] = [];
    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else out.push({ key: path.relative(LOCAL_ROOT, full).split(path.sep).join("/"), size: (await stat(full)).size });
      }
    };
    await walk(LOCAL_ROOT);
    return out;
  }
  const { client, mod, bucket } = await s3();
  const out: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new mod.ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }));
    for (const o of page.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0 });
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** Removes a file and any smaller copies made of it (see fittedImage). Missing ones are fine. */
export async function deleteStoredWithCopies(key: string) {
  await deleteStored(key).catch(() => {});
  for (const w of IMAGE_WIDTHS) await deleteStored(`derived/w${w}/${key}.jpg`).catch(() => {});
}

export async function deleteStored(key: string) {
  if (storageDriver() === "local") {
    await rm(localPath(key), { force: true });
    return;
  }
  const { client, mod, bucket } = await s3();
  await client.send(new mod.DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
