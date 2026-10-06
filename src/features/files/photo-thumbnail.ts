import "server-only";

import sharp from "sharp";

// These budgets apply to a single private, on-demand preview. No original or
// transformed image is persisted, put in a shared cache, or sent to an AI model.
export const maxPhotoPreviewInputBytes = 12 * 1024 * 1024;
export const maxPhotoPreviewPixels = 24_000_000;
export const maxPhotoPreviewOutputBytes = 512 * 1024;
export const photoPreviewEdge = 640;
export const photoPreviewTimeoutMs = 15_000;

export const photoPreviewHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

const photoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

export class PhotoPreviewError extends Error {
  constructor(public readonly code: "unsupported" | "too_large" | "invalid") {
    super(`photo_preview_${code}`);
  }
}

export function supportsPhotoPreview(mime: string) {
  return photoMimeTypes.has(mime.toLowerCase());
}

export function checkPhotoPreviewSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1) throw new PhotoPreviewError("invalid");
  if (size > maxPhotoPreviewInputBytes) throw new PhotoPreviewError("too_large");
}

/** Check the declared budget before buffering, and enforce it again per chunk. */
export async function readPhotoPreviewInput(body: ReadableStream<Uint8Array>, expectedSize: number, signal: AbortSignal) {
  try {
    checkPhotoPreviewSize(expectedSize);
    signal.throwIfAborted();
  } catch (error) {
    await body.cancel().catch(() => {});
    throw error;
  }

  const reader = body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > expectedSize || size > maxPhotoPreviewInputBytes) throw new PhotoPreviewError("too_large");
      chunks.push(value);
    }
    if (size !== expectedSize) throw new PhotoPreviewError("invalid");
    return Buffer.concat(chunks, size);
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Select a raster decoder before asking sharp to open the image. */
function hasPhotoSignature(bytes: Buffer, mime: string) {
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6));
  if (mime === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (mime === "image/avif" && bytes.length >= 16 && bytes.toString("ascii", 4, 8) === "ftyp") {
    const boxSize = bytes.readUInt32BE(0);
    if (boxSize < 16 || boxSize > bytes.length) return false;
    // Major brand followed by the compatible brands, skipping minor_version.
    if (["avif", "avis"].includes(bytes.toString("ascii", 8, 12))) return true;
    for (let offset = 16; offset + 4 <= Math.min(boxSize, 256); offset += 4) {
      if (["avif", "avis"].includes(bytes.toString("ascii", offset, offset + 4))) return true;
    }
  }
  return false;
}

/** One oriented frame; sharp strips EXIF/ICC/XMP unless explicitly retained. */
export async function createPhotoThumbnail(bytes: Buffer, contentType: string, signal: AbortSignal) {
  checkPhotoPreviewSize(bytes.byteLength);
  const mime = contentType.toLowerCase();
  if (!supportsPhotoPreview(mime) || !hasPhotoSignature(bytes, mime)) throw new PhotoPreviewError("unsupported");
  signal.throwIfAborted();
  const image = sharp(bytes, {
    failOn: "warning", limitInputPixels: maxPhotoPreviewPixels,
    limitInputChannels: 4, pages: 1, page: 0, animated: false,
  }).timeout({ seconds: 5 });
  const cancel = () => { image.destroy(); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const metadata = await image.metadata();
    signal.throwIfAborted();
    const detectedMime = metadata.format === "heif" && metadata.compression === "av1"
      ? "image/avif" : `image/${metadata.format}`;
    if (detectedMime !== mime) throw new PhotoPreviewError("unsupported");
    const height = metadata.pageHeight ?? metadata.height;
    if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(height) || metadata.width < 1 || height < 1)
      throw new PhotoPreviewError("invalid");
    if (metadata.width * height > maxPhotoPreviewPixels) throw new PhotoPreviewError("too_large");

    const { data, info } = await image.autoOrient()
      .resize(photoPreviewEdge, photoPreviewEdge, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75, effort: 3 })
      .toBuffer({ resolveWithObject: true });
    signal.throwIfAborted();
    if (info.width > photoPreviewEdge || info.height > photoPreviewEdge || data.byteLength > maxPhotoPreviewOutputBytes)
      throw new PhotoPreviewError("too_large");
    if (!data.byteLength) throw new PhotoPreviewError("invalid");
    return data;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof PhotoPreviewError) throw error;
    throw new PhotoPreviewError("invalid");
  } finally {
    signal.removeEventListener("abort", cancel);
    image.destroy();
  }
}
