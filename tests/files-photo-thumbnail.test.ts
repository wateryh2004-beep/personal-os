import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  checkPhotoPreviewSize, createPhotoThumbnail, maxPhotoPreviewInputBytes,
  maxPhotoPreviewOutputBytes, PhotoPreviewError, photoPreviewEdge,
  readPhotoPreviewInput, supportsPhotoPreview,
} from "@/features/files/photo-thumbnail";

const signal = () => new AbortController().signal;
const solid = (width = 80, height = 40) => sharp({ create: { width, height, channels: 4, background: "#dd4422" } });

describe("bounded photo preview input", () => {
  it("accepts the exact input cap and only the supported photo MIME types", () => {
    expect(() => checkPhotoPreviewSize(maxPhotoPreviewInputBytes)).not.toThrow();
    expect(() => checkPhotoPreviewSize(maxPhotoPreviewInputBytes + 1)).toThrow("photo_preview_too_large");
    for (const size of [0, -1, Number.NaN, 1.2]) expect(() => checkPhotoPreviewSize(size)).toThrow("photo_preview_invalid");
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "IMAGE/JPEG"])
      expect(supportsPhotoPreview(mime)).toBe(true);
    for (const mime of ["image/svg+xml", "image/heic", "image/tiff", "application/pdf", "application/octet-stream"])
      expect(supportsPhotoPreview(mime)).toBe(false);
  });

  it("reads a complete bounded stream and releases its lock", async () => {
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1, 2])); c.enqueue(new Uint8Array([3])); c.close(); } });
    expect(await readPhotoPreviewInput(body, 3, signal())).toEqual(Buffer.from([1, 2, 3]));
    expect(body.locked).toBe(false);
  });

  it("cancels an over-budget source before reading bytes", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    await expect(readPhotoPreviewInput(body, maxPhotoPreviewInputBytes + 1, signal())).rejects.toThrow("photo_preview_too_large");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels an overflowing stream and rejects a truncated stream", async () => {
    const cancel = vi.fn();
    const overflow = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4)); c.enqueue(new Uint8Array(4)); }, cancel });
    await expect(readPhotoPreviewInput(overflow, 6, signal())).rejects.toThrow("photo_preview_too_large");
    expect(cancel).toHaveBeenCalledOnce();
    expect(overflow.locked).toBe(false);
    const truncated = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4)); c.close(); } });
    await expect(readPhotoPreviewInput(truncated, 6, signal())).rejects.toThrow("photo_preview_invalid");
  });

  it("cancels a pending read on client cancellation or preview timeout", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const reading = readPhotoPreviewInput(body, 6, controller.signal);
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
});

describe("synthetic photo thumbnail transforms", () => {
  it.each(["jpeg", "png", "webp", "avif", "gif"] as const)("converts %s bytes into a small WebP without upscaling", async (format) => {
    const source = await solid().toFormat(format).toBuffer();
    const output = await createPhotoThumbnail(source, `image/${format}`, signal());
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 80, height: 40 });
    expect(metadata.pages ?? 1).toBe(1);
    expect(output.byteLength).toBeLessThanOrEqual(maxPhotoPreviewOutputBytes);
  });

  it("fits a large photo within 640 pixels while preserving its aspect ratio", async () => {
    const output = await createPhotoThumbnail(await solid(1600, 800).jpeg().toBuffer(), "image/jpeg", signal());
    expect(await sharp(output).metadata()).toMatchObject({ width: photoPreviewEdge, height: photoPreviewEdge / 2 });
  });

  it("applies EXIF orientation, then drops source metadata", async () => {
    const source = await solid().withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Artist: "Synthetic fixture author" } }).jpeg().toBuffer();
    expect((await sharp(source).metadata()).orientation).toBe(6);
    const output = await createPhotoThumbnail(source, "image/jpeg", signal());
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ width: 40, height: 80, hasProfile: false });
    for (const field of ["orientation", "exif", "icc", "iptc", "xmp"] as const) expect(metadata[field]).toBeUndefined();
  });

  it("uses only the first frame of a two-frame GIF", async () => {
    const pixels = Buffer.alloc(8 * 16 * 3);
    for (let pixel = 0; pixel < 8 * 16; pixel++) pixels[pixel * 3 + (pixel < 64 ? 0 : 2)] = 255;
    const source = await sharp(pixels, { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } })
      .gif({ delay: [100, 100], loop: 0 }).toBuffer();
    expect((await sharp(source).metadata()).pages).toBe(2);
    const output = await createPhotoThumbnail(source, "image/gif", signal());
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ width: 8, height: 8 });
    expect(metadata.pages ?? 1).toBe(1);
    const { data } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(200);
    expect(data[2]).toBeLessThan(40);
  });

  it("rejects unsupported images, mismatched MIME, and incomplete raster bytes", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
    await expect(createPhotoThumbnail(svg, "image/svg+xml", signal())).rejects.toThrow("photo_preview_unsupported");
    const png = await solid().png().toBuffer();
    await expect(createPhotoThumbnail(png, "image/jpeg", signal())).rejects.toThrow("photo_preview_unsupported");
    await expect(createPhotoThumbnail(png.subarray(0, 40), "image/png", signal())).rejects.toThrow("photo_preview_invalid");
  });

  it("refuses a synthetic 25-megapixel image even though its compressed bytes are small", async () => {
    const source = await solid(5000, 5000).png().toBuffer();
    expect(source.byteLength).toBeLessThan(maxPhotoPreviewInputBytes);
    await expect(createPhotoThumbnail(source, "image/png", signal())).rejects.toBeInstanceOf(PhotoPreviewError);
  });

  it("enforces the transformed output budget for a noisy transparent image", async () => {
    const pixels = Buffer.alloc(photoPreviewEdge * photoPreviewEdge * 4);
    let seed = 1729;
    for (let i = 0; i < pixels.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[i] = seed >>> 24;
    }
    const source = await sharp(pixels, { raw: { width: photoPreviewEdge, height: photoPreviewEdge, channels: 4 } }).png().toBuffer();
    const unboundedOutput = await sharp(source).webp({ quality: 75, effort: 3 }).toBuffer();
    expect(unboundedOutput.byteLength).toBeGreaterThan(maxPhotoPreviewOutputBytes);
    await expect(createPhotoThumbnail(source, "image/png", signal())).rejects.toThrow("photo_preview_too_large");
  });

  it("does not start a transform after the request is cancelled", async () => {
    const source = await solid().png().toBuffer();
    const controller = new AbortController();
    controller.abort();
    await expect(createPhotoThumbnail(source, "image/png", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("stops serving a preview when the browser cancels during processing", async () => {
    const source = await solid(1600, 800).png().toBuffer();
    const controller = new AbortController();
    const thumbnail = createPhotoThumbnail(source, "image/png", controller.signal);
    controller.abort();
    await expect(thumbnail).rejects.toMatchObject({ name: "AbortError" });
  });
});
