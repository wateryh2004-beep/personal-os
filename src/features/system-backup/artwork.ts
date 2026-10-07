import "server-only";
import { createHash } from "node:crypto";
import { isR2Configured, readR2Artwork } from "@/lib/adapters/cloudflare-r2";
import { readArtworkManifest, type ArtworkManifest } from "@/features/leisure/artwork-storage";
import { artworkImportRegistry } from "@/features/leisure/artwork-import-registry";
import { backupJson } from "./export";
import { uuidPattern } from "./contract";

export type ArtworkInventoryEntry = { id: string; status: "present" | "not_imported" | "unavailable"; manifest: ArtworkManifest | null; manifestSha256: string | null; manifestBytes: number | null };
export type ArtworkInventory = { status: "complete" | "unavailable"; entries: ArtworkInventoryEntry[] };
export type ArtworkObject = { path: string; bytes: number; sha256: string; mime: string };
export type ArtworkBackup = {
  inventory: ArtworkInventory;
  objects(signal: AbortSignal): AsyncIterable<ArtworkObject & { data: Buffer }>;
  stable(signal: AbortSignal): Promise<boolean>;
};
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const extension = (mime: string) => mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
export const unavailableArtworkInventory: ArtworkInventory = { status: "unavailable", entries: [] };

export function artworkObjects(entry: ArtworkInventoryEntry): ArtworkObject[] {
  if (!entry.manifest || entry.status !== "present") return [];
  const objects: ArtworkObject[] = [{ path: `${entry.id}/${sha(entry.manifest.source)}.json`, bytes: entry.manifestBytes!, sha256: entry.manifestSha256!, mime: "application/json" },
    ...[entry.manifest.original, entry.manifest.variants[640], entry.manifest.variants[1280]].map(file => ({ path: `${entry.id}/${file.sha256}.${extension(file.mime)}`, bytes: file.bytes, sha256: file.sha256, mime: file.mime }))];
  const unique = new Map<string, ArtworkObject>();
  for (const object of objects) {
    const previous = unique.get(object.path);
    if (previous && backupJson(previous) !== backupJson(object)) throw new Error("backup_artwork_reference_conflict");
    unique.set(object.path, object);
  }
  return [...unique.values()];
}

async function inventory(owner: string, signal: AbortSignal): Promise<ArtworkInventory> {
  if (!uuidPattern.test(owner)) throw new Error("backup_invalid_owner");
  if (!isR2Configured()) return unavailableArtworkInventory;
  const entries = await Promise.all(artworkImportRegistry.map(async entry => {
    signal.throwIfAborted();
    const missing = { id: entry.id, manifest: null, manifestSha256: null, manifestBytes: null };
    try {
      const manifest = await readArtworkManifest(owner, entry);
      if (!manifest) return { ...missing, status: "not_imported" as const };
      // Preserve the exact immutable activation manifest, not a reserialized copy.
      const raw = await readR2Artwork(`${owner}/leisure-artwork/v1/${entry.id}/${sha(entry.src)}.json`, 16 * 1024);
      if (!raw || raw.contentType !== "application/json" || backupJson(JSON.parse(raw.bytes.toString("utf8"))) !== backupJson(manifest)) throw new Error("backup_artwork_changed");
      return { id: entry.id, status: "present" as const, manifest, manifestSha256: sha(raw.bytes), manifestBytes: raw.bytes.length };
    } catch {
      return { ...missing, status: "unavailable" as const };
    }
  }));
  signal.throwIfAborted();
  return { status: entries.some(entry => entry.status === "unavailable") ? "unavailable" : "complete", entries };
}

/** Fixed existing registry + owner-prefixed reads only. No external URL fetch,
 * import, bucket listing, object write, overwrite, or deletion exists here. */
export async function prepareArtworkBackup(owner: string, signal: AbortSignal): Promise<ArtworkBackup> {
  const initial = await inventory(owner, signal);
  return {
    inventory: initial,
    async *objects(objectSignal) {
      for (const entry of initial.entries) for (const descriptor of artworkObjects(entry)) {
        objectSignal.throwIfAborted();
        const object = await readR2Artwork(`${owner}/leisure-artwork/v1/${descriptor.path}`, descriptor.mime === "application/json" ? 16 * 1024 : 5 * 1024 * 1024);
        objectSignal.throwIfAborted();
        if (!object || object.contentType !== descriptor.mime || object.bytes.length !== descriptor.bytes || sha(object.bytes) !== descriptor.sha256) throw new Error("backup_artwork_corrupt");
        yield { ...descriptor, data: object.bytes };
      }
    },
    async stable(verifySignal) { return backupJson(initial) === backupJson(await inventory(owner, verifySignal)); },
  };
}
