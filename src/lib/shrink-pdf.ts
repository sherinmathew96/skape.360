/**
 * Browser-only: makes a PDF smaller without touching what it looks like.
 * Uncompressed parts (often line work and text from CAD exports) are
 * deflated, and objects are packed into compressed object streams. Images,
 * fonts and vectors keep their exact data, so print quality is unchanged.
 * Returns the original when the PDF is encrypted, unreadable, or no smaller.
 */
export async function compressPdf(file: File): Promise<File> {
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return file;
  if (typeof CompressionStream === "undefined") return file;
  try {
    const { PDFDocument, PDFName, PDFRawStream } = await import("pdf-lib");
    const original = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(original, { updateMetadata: false });
    const pages = doc.getPageCount();
    // 300 dpi across the largest page is the most detail print can use.
    const maxPx = Math.ceil(
      Math.max(...doc.getPages().map((p) => Math.max(p.getWidth(), p.getHeight()))) / 72 * 300,
    );
    const name = (k: string) => PDFName.of(k);

    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const filter = obj.dict.get(name("Filter"));
      if (filter === name("DCTDecode") && obj.dict.get(name("Subtype")) === name("Image")) {
        const smaller = await downsampleJpeg(obj, maxPx, doc.context);
        if (smaller) doc.context.assign(ref, PDFRawStream.of(smaller.dict, smaller.bytes));
        continue;
      }
      if (filter || obj.contents.length < 512) continue;
      const deflated = await deflate(obj.contents);
      if (deflated.length >= obj.contents.length * 0.9) continue;
      const dict = obj.dict.clone(doc.context);
      dict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"));
      dict.delete(PDFName.of("DecodeParms"));
      doc.context.assign(ref, PDFRawStream.of(dict, deflated));
    }

    const out = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
    if (out.length >= original.length * 0.97) return file;
    // The result must open and keep every page.
    const check = await PDFDocument.load(out, { updateMetadata: false });
    if (check.getPageCount() !== pages) return file;
    return new File([out as BlobPart], file.name, { type: "application/pdf", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

type RawStream = import("pdf-lib").PDFRawStream;
type Context = import("pdf-lib").PDFContext;

/**
 * A JPEG photo inside the PDF is saved again at quality 0.92, and scaled to
 * 300 dpi at full page size when it is larger than that. RGB and grey images only;
 * CMYK, masked-by-colour or custom-decode images are left as they are.
 */
async function downsampleJpeg(stream: RawStream, maxPx: number, context: Context) {
  const { PDFName, PDFNumber, PDFArray } = await import("pdf-lib");
  const d = stream.dict;
  const num = (k: string) => {
    const v = d.lookup(PDFName.of(k));
    return v instanceof PDFNumber ? v.asNumber() : 0;
  };
  const w = num("Width");
  const h = num("Height");
  if (!w || !h || w * h < 250_000) return null;
  if (d.get(PDFName.of("Decode")) || d.get(PDFName.of("Mask")) || d.get(PDFName.of("ImageMask"))) return null;
  const cs = d.lookup(PDFName.of("ColorSpace"));
  let gray = false;
  if (cs === PDFName.of("DeviceGray")) gray = true;
  else if (cs instanceof PDFArray && cs.lookup(0) === PDFName.of("ICCBased")) {
    const n = (cs.lookup(1) as RawStream | undefined)?.dict.lookup(PDFName.of("N"));
    if (!(n instanceof PDFNumber) || (n.asNumber() !== 3 && n.asNumber() !== 1)) return null;
    gray = n.asNumber() === 1;
  } else if (cs !== PDFName.of("DeviceRGB")) return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([stream.contents as BlobPart], { type: "image/jpeg" }));
  } catch {
    return null;
  }
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return bitmap.close(), null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  const out = { w: canvas.width, h: canvas.height };
  canvas.width = canvas.height = 0;
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Same size: only worth it when the photo was saved far above print quality.
  if (bytes.length >= stream.contents.length * (scale < 1 ? 0.9 : 0.7)) return null;
  const dict = d.clone(context);
  dict.set(PDFName.of("Width"), PDFNumber.of(out.w));
  dict.set(PDFName.of("Height"), PDFNumber.of(out.h));
  dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
  dict.delete(PDFName.of("DecodeParms"));
  // The canvas always writes colour; a grey image's colour space must follow.
  if (gray) dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
  return { dict, bytes };
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
