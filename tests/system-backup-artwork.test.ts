import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { artworkImportRegistry } from "@/features/leisure/artwork-import-registry";
import portableRegistry from "@/features/system-backup/artwork-registry.json";
import { systemBackup } from "@/features/system-backup/export";
import { prepareArtworkBackup } from "@/features/system-backup/artwork";
import { readArtworkManifest } from "@/features/leisure/artwork-storage";
import type { ArtworkManifest } from "@/features/leisure/artwork-storage";
import { backupOwner, backupSource } from "./helpers/system-backup-fixtures";

const state = vi.hoisted(() => ({ configured: true, objects: new Map<string, { bytes: Buffer; contentType: string }>(), manifest: null as unknown, reads: [] as string[] }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ isR2Configured: () => state.configured, readR2Artwork: vi.fn(async (key: string) => { state.reads.push(key); return state.objects.get(key) ?? null; }) }));
vi.mock("@/features/leisure/artwork-storage", () => ({ readArtworkManifest: vi.fn(async (_owner: string, entry: { id: string }) => entry.id === "shameless-us" ? state.manifest : null) }));
const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const first = artworkImportRegistry[0];
const dirs: string[] = [];
function temp() { const dir = mkdtempSync(path.join(tmpdir(), "system-artwork-")); dirs.push(dir); return dir; }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => {
  vi.mocked(readArtworkManifest).mockClear();
  state.configured = true; state.objects.clear(); state.reads = [];
  const original = Buffer.from("synthetic-jpeg-original"); const small = Buffer.from("synthetic-webp-640"); const large = Buffer.from("synthetic-webp-1280");
  const file = (bytes: Buffer, mime: "image/jpeg" | "image/webp", width: number, height: number) => ({ bytes: bytes.length, sha256: sha(bytes), mime, width, height });
  const manifest: ArtworkManifest = { version: 1, id: first.id, source: first.src, sourceUrl: first.sourceUrl, credit: first.credit, verifiedAt: "2026-10-01T00:00:00.000Z",
    original: file(original, "image/jpeg", first.width, first.height), variants: { "640": file(small, "image/webp", 640, 360), "1280": file(large, "image/webp", 1200, 675) } };
  const prefix = `${backupOwner}/leisure-artwork/v1/${first.id}/`;
  state.objects.set(`${prefix}${sha(first.src)}.json`, { bytes: Buffer.from(JSON.stringify(manifest)), contentType: "application/json" });
  for (const [bytes, ext, mime] of [[original, "jpg", "image/jpeg"], [small, "webp", "image/webp"], [large, "webp", "image/webp"]] as const) state.objects.set(`${prefix}${sha(bytes)}.${ext}`, { bytes, contentType: mime });
  state.manifest = manifest;
});
async function snapshot() {
  const signal = new AbortController().signal;
  const artwork = await prepareArtworkBackup(backupOwner, signal);
  const chunks: Uint8Array[] = [];
  for await (const chunk of systemBackup(backupSource({}), backupOwner, signal, undefined, artwork)) chunks.push(chunk);
  return Buffer.concat(chunks);
}
function verify(bytes: Buffer, target = false) {
  const dir = temp(); const file = path.join(dir, "snapshot.ndjson"); writeFileSync(file, bytes);
  const destination = path.join(dir, "recovered");
  const result = spawnSync("python3", ["scripts/verify-system-backup.py", file, ...(target ? ["--restore-to", destination] : [])], { encoding: "utf8" });
  return { code: result.status, value: JSON.parse(result.stdout), destination };
}

describe("Embedded existing private Leisure artwork recovery", () => {
  it("keeps the offline inventory tied to exactly the existing public import registry", () => { expect(portableRegistry).toEqual(artworkImportRegistry); });
  it("recovers unchanged originals, variants and activation manifests with checksum and source references", async () => {
    const { code, value, destination } = verify(await snapshot(), true);
    expect(code, JSON.stringify(value)).toBe(0);
    expect(value.artwork).toMatchObject({ verified: true, presentAssets: 1, notImportedAssets: 15, verifiedObjects: 4 });
    const object = `${first.id}/${sha(first.src)}.json`;
    expect(readFileSync(path.join(destination, "artwork", object))).toEqual(state.objects.get(`${backupOwner}/leisure-artwork/v1/${object}`)!.bytes);
    const original = (state.manifest as ArtworkManifest).original;
    expect(readFileSync(path.join(destination, "artwork", first.id, `${original.sha256}.jpg`))).toEqual(Buffer.from("synthetic-jpeg-original"));
    expect(state.reads.every(key => key.startsWith(`${backupOwner}/leisure-artwork/v1/`))).toBe(true);
  });
  it("reports unknown artwork inventory as an explicit recovery gap, never silently as empty", async () => {
    state.configured = false;
    const result = verify(await snapshot());
    expect(result.code).toBe(3); expect(result.value.artwork.unavailableAssets).toBe(16); expect(state.reads).toHaveLength(0);
  });
  it("keeps denied manifest reads distinct from known-unimported artwork", async () => {
    vi.mocked(readArtworkManifest).mockRejectedValueOnce(new Error("access_denied"));
    const source = await prepareArtworkBackup(backupOwner, new AbortController().signal);
    expect(source.inventory.status).toBe("unavailable");
    expect(source.inventory.entries[0].status).toBe("unavailable");
    expect(source.inventory.entries.slice(1).every(entry => entry.status === "not_imported")).toBe(true);
  });
  it("refuses cross-owner inputs, corrupt originals and interrupted artifact records", async () => {
    await expect(prepareArtworkBackup("../other-owner", new AbortController().signal)).rejects.toThrow("backup_invalid_owner");
    const original = (state.manifest as ArtworkManifest).original;
    state.objects.set(`${backupOwner}/leisure-artwork/v1/${first.id}/${original.sha256}.jpg`, { bytes: Buffer.from("corrupt"), contentType: "image/jpeg" });
    await expect(snapshot()).rejects.toThrow("backup_artwork_corrupt");
  });
  it("rejects binary tampering, removed originals and path traversal instead of publishing recovery", async () => {
    const bytes = await snapshot(); const lines = bytes.toString().trimEnd().split("\n");
    const index = lines.findIndex(line => JSON.parse(line).type === "artwork_object");
    for (const mutation of ["tamper", "remove", "path"]) {
      const changed = [...lines]; const object = JSON.parse(changed[index]);
      if (mutation === "remove") changed.splice(index, 1);
      else { if (mutation === "tamper") object.data = Buffer.from("bad").toString("base64"); else object.path = "../../escape"; changed[index] = JSON.stringify(object); }
      const result = verify(Buffer.from(changed.join("\n") + "\n"), true);
      expect(result.code).not.toBe(0); expect(result.value.businessDataVerified).not.toBe(true);
    }
  });
});
