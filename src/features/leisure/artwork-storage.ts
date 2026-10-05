import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { createImmutableR2Artwork, isR2Configured, readR2Artwork } from "@/lib/adapters/cloudflare-r2";
import { artworkImportRegistry, findArtworkImport, type ArtworkImportEntry } from "./artwork-import-registry";

export const artworkPrivateHeaders = {
  "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie",
  "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
};
export const maxArtworkBytes = 5 * 1024 * 1024;
const maxManifestBytes = 16 * 1024;
const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fileSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/), bytes: z.number().int().positive().max(maxArtworkBytes),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  width: z.number().int().positive().max(4096), height: z.number().int().positive().max(4096),
}).strict();
const manifestSchema = z.object({
  version: z.literal(1), id: z.string(), source: z.string().url(), sourceUrl: z.string().url(),
  credit: z.string(), verifiedAt: z.string().datetime(), original: fileSchema,
  variants: z.object({ "640": fileSchema, "1280": fileSchema }).strict(),
}).strict();
export type ArtworkManifest = z.infer<typeof manifestSchema>;
type ArtworkFile = z.infer<typeof fileSchema>;

function prefix(owner: string, entry: ArtworkImportEntry) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner)) throw new Error("invalid_owner");
  return `${owner.toLowerCase()}/leisure-artwork/v1/${entry.id}/`;
}
const extension = (mime: ArtworkFile["mime"]) => mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
function fileKey(owner: string, entry: ArtworkImportEntry, file: ArtworkFile) {
  return `${prefix(owner, entry)}${file.sha256}.${extension(file.mime)}`;
}
function manifestKey(owner: string, entry: ArtworkImportEntry) {
  return `${prefix(owner, entry)}${digest(entry.src)}.json`;
}

export async function readArtworkManifest(owner: string, entry: ArtworkImportEntry) {
  const object = await readR2Artwork(manifestKey(owner, entry), maxManifestBytes);
  if (!object) return null;
  if (object.contentType !== "application/json") throw new Error("invalid_artwork_manifest");
  const manifest = manifestSchema.parse(JSON.parse(object.bytes.toString("utf8")));
  if (manifest.id !== entry.id || manifest.source !== entry.src || manifest.sourceUrl !== entry.sourceUrl
    || manifest.credit !== entry.credit || manifest.original.width !== entry.width || manifest.original.height !== entry.height)
    throw new Error("artwork_manifest_mismatch");
  for (const width of [640, 1280] as const) {
    const variant = manifest.variants[width];
    const expectedWidth = Math.min(width, entry.width);
    if (variant.mime !== "image/webp" || variant.width !== expectedWidth
      || Math.abs(variant.height - entry.height * expectedWidth / entry.width) > 1)
      throw new Error("artwork_variant_mismatch");
  }
  return manifest;
}

async function verifiedFile(owner: string, entry: ArtworkImportEntry, file: ArtworkFile) {
  const object = await readR2Artwork(fileKey(owner, entry, file), maxArtworkBytes);
  if (!object || object.contentType !== file.mime || object.bytes.byteLength !== file.bytes || digest(object.bytes) !== file.sha256)
    throw new Error("artwork_verification_failed");
  return object.bytes;
}

/** Only the frozen public URL can be fetched. Redirects never expand its scope. */
async function downloadArtwork(entry: ArtworkImportEntry) {
  const response = await fetch(entry.src, { redirect: "error", cache: "no-store",
    headers: { Accept: "image/jpeg,image/png,image/webp" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok || response.redirected || (response.url && response.url !== entry.src)) {
    await response.body?.cancel().catch(() => {});
    throw new Error("artwork_source_unavailable");
  }
  const mime = response.headers.get("content-type")?.split(";")[0].trim();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime ?? "")) {
    await response.body?.cancel().catch(() => {});
    throw new Error("invalid_artwork_type");
  }
  const declaredSize = response.headers.get("content-length");
  if (declaredSize && (!/^\d+$/.test(declaredSize) || Number(declaredSize) > maxArtworkBytes)) {
    await response.body?.cancel().catch(() => {});
    throw new Error("artwork_too_large");
  }
  if (!response.body) throw new Error("empty_artwork");
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxArtworkBytes) throw new Error("artwork_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!size) throw new Error("empty_artwork");
  const bytes = Buffer.concat(chunks);
  const metadata = await sharp(bytes, { limitInputPixels: 4096 * 4096, failOn: "warning" }).metadata();
  const detectedMime = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : null;
  if (!detectedMime || detectedMime !== mime || metadata.width !== entry.width || metadata.height !== entry.height
    || (metadata.pages ?? 1) !== 1) throw new Error("invalid_artwork_image");
  return { bytes, mime: detectedMime as ArtworkFile["mime"] };
}

async function persistFile(owner: string, entry: ArtworkImportEntry, bytes: Buffer, mime: ArtworkFile["mime"], width: number, height: number) {
  const file: ArtworkFile = { sha256: digest(bytes), bytes: bytes.byteLength, mime, width, height };
  fileSchema.parse(file);
  await createImmutableR2Artwork(fileKey(owner, entry, file), bytes, mime);
  await verifiedFile(owner, entry, file);
  return file;
}

/** One explicit asset per action. Retry verifies and reuses immutable bytes; never deletes. */
export async function importPrivateArtwork(owner: string, id: string) {
  const entry = findArtworkImport(id);
  if (!entry) throw new Error("unknown_artwork");
  if (!isR2Configured()) throw new Error("r2_not_configured");
  const existing = await readArtworkManifest(owner, entry);
  if (existing) {
    await Promise.all([existing.original, existing.variants[640], existing.variants[1280]].map((file) => verifiedFile(owner, entry, file)));
    return existing;
  }
  const source = await downloadArtwork(entry);
  // Decode both bounded variants before writing anything, rejecting corrupt/truncated raster data.
  const resized = await Promise.all(([640, 1280] as const).map(async (width) => {
    const image = await sharp(source.bytes, { limitInputPixels: 4096 * 4096, failOn: "warning" })
      .resize({ width, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer({ resolveWithObject: true });
    return { width, ...image };
  }));
  const original = await persistFile(owner, entry, source.bytes, source.mime, entry.width, entry.height);
  const variants = {} as ArtworkManifest["variants"];
  for (const image of resized) variants[image.width] = await persistFile(owner, entry, image.data, "image/webp", image.info.width, image.info.height);
  const manifest: ArtworkManifest = { version: 1, id, source: entry.src, sourceUrl: entry.sourceUrl, credit: entry.credit,
    verifiedAt: new Date().toISOString(), original, variants };
  // Activation happens last. A crash beforehand leaves only private, unreferenced immutable objects.
  await createImmutableR2Artwork(manifestKey(owner, entry), Buffer.from(JSON.stringify(manifest)), "application/json");
  const active = await readArtworkManifest(owner, entry);
  if (!active) throw new Error("artwork_manifest_missing");
  await Promise.all([active.original, active.variants[640], active.variants[1280]].map((file) => verifiedFile(owner, entry, file)));
  return active;
}

export async function getPrivateArtworkSources(owner: string) {
  if (!isR2Configured()) return {};
  const entries = await Promise.all(artworkImportRegistry.map(async (entry) => {
    try {
      const manifest = await readArtworkManifest(owner, entry);
      return manifest ? [entry.src, `/api/leisure/artwork/${entry.id}`] as const : null;
    } catch { return null; } // Unavailable or corrupt storage never disables official fallback.
  }));
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

export async function getPrivateArtworkBytes(owner: string, id: string, width: 640 | 1280) {
  const entry = findArtworkImport(id);
  if (!entry || !isR2Configured()) return null;
  const manifest = await readArtworkManifest(owner, entry);
  if (!manifest) return null;
  return verifiedFile(owner, entry, manifest.variants[width]);
}
