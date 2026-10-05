import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { artworkImportRegistry } from "@/features/leisure/artwork-import-registry";

const memory = vi.hoisted(() => ({ objects: new Map<string, { bytes: Buffer; contentType: string }>(),
  configured: true, corrupt: false, failManifest: false }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({
  isR2Configured: () => memory.configured,
  createImmutableR2Artwork: vi.fn(async (key: string, bytes: Uint8Array, contentType: string) => {
    if (memory.failManifest && key.endsWith(".json")) throw new Error("manifest_write_failed");
    if (!memory.objects.has(key)) memory.objects.set(key, { bytes: Buffer.from(bytes), contentType });
  }),
  readR2Artwork: vi.fn(async (key: string) => {
    const object = memory.objects.get(key);
    return object && memory.corrupt && !key.endsWith(".json") ? { ...object, bytes: Buffer.from("corrupted") } : object ?? null;
  }),
}));
import { createImmutableR2Artwork, readR2Artwork } from "@/lib/adapters/cloudflare-r2";
import { getPrivateArtworkBytes, getPrivateArtworkSources, importPrivateArtwork, maxArtworkBytes } from "@/features/leisure/artwork-storage";

const owner = "d4078269-8eb3-43b0-9c26-977b5d542a9b";
const first = artworkImportRegistry[0];
let image: Buffer;
const fetchMock = vi.fn();
beforeEach(async () => {
  vi.clearAllMocks(); memory.objects.clear(); memory.configured = true; memory.corrupt = false; memory.failManifest = false;
  image = await sharp({ create: { width: first.width, height: first.height, channels: 3, background: "#254d40" } }).jpeg().toBuffer();
  fetchMock.mockReset().mockImplementation(async () => new Response(new Uint8Array(image), { headers: { "Content-Type": "image/jpeg" } }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("bounded private leisure artwork migration", () => {
  it("freezes exactly the existing 16 HTTPS source URLs, not new collection entries", () => {
    expect(artworkImportRegistry).toHaveLength(16);
    expect(new Set(artworkImportRegistry.map((entry) => entry.id)).size).toBe(16);
    expect(new Set(artworkImportRegistry.map((entry) => entry.src)).size).toBe(16);
    expect(artworkImportRegistry.every((entry) => new URL(entry.src).protocol === "https:")).toBe(true);
  });

  it("preserves original bytes, verifies private variants, and activates the manifest last", async () => {
    const manifest = await importPrivateArtwork(owner, first.id);
    expect(manifest.original.sha256).toBe(createHash("sha256").update(image).digest("hex"));
    expect(manifest.original.bytes).toBe(image.length);
    expect(manifest.source).toBe(first.src); expect(manifest.credit).toBe(first.credit);
    expect(manifest.variants[640].width).toBe(640);
    expect(manifest.variants[1280].width).toBe(first.width);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(first.src, expect.objectContaining({ redirect: "error", cache: "no-store" }));
    const writes = vi.mocked(createImmutableR2Artwork).mock.calls;
    expect(writes).toHaveLength(4); expect(writes.at(-1)![0]).toMatch(/\.json$/);
    expect(writes.every(([key]) => key.startsWith(`${owner}/leisure-artwork/v1/${first.id}/`))).toBe(true);
    expect([...memory.objects.values()].some((object) => object.bytes.equals(image))).toBe(true);
    expect(await getPrivateArtworkSources(owner)).toEqual({ [first.src]: `/api/leisure/artwork/${first.id}` });
    const privateBytes = await getPrivateArtworkBytes(owner, first.id, 640);
    expect((await sharp(privateBytes!).metadata()).format).toBe("webp");
    expect((await sharp(privateBytes!).metadata()).width).toBe(640);
  });

  it("retries without fetching or overwriting any object", async () => {
    const initial = await importPrivateArtwork(owner, first.id);
    const writes = vi.mocked(createImmutableR2Artwork).mock.calls.length;
    expect(await importPrivateArtwork(owner, first.id)).toEqual(initial);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createImmutableR2Artwork).toHaveBeenCalledTimes(writes);
  });

  it("rejects unknown IDs, attacker URLs and unconfigured storage before network/writes", async () => {
    await expect(importPrivateArtwork(owner, "https://127.0.0.1/private")).rejects.toThrow("unknown_artwork");
    await expect(importPrivateArtwork("../other-owner", first.id)).rejects.toThrow("invalid_owner");
    memory.configured = false;
    await expect(importPrivateArtwork(owner, first.id)).rejects.toThrow("r2_not_configured");
    expect(fetchMock).not.toHaveBeenCalled(); expect(createImmutableR2Artwork).not.toHaveBeenCalled();
  });

  it.each([
    ["redirect", () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/image" } })],
    ["html", () => new Response("<html>sign in</html>", { headers: { "content-type": "text/html" } })],
    ["svg", () => new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } })],
    ["oversized declaration", () => new Response("x", { headers: { "content-type": "image/jpeg", "content-length": String(maxArtworkBytes + 1) } })],
    ["oversized stream", () => new Response(new Uint8Array(maxArtworkBytes + 1), { headers: { "content-type": "image/jpeg" } })],
    ["corrupt image", () => new Response("not jpeg", { headers: { "content-type": "image/jpeg" } })],
  ])("rejects %s before any write", async (_name, response) => {
    fetchMock.mockImplementationOnce(async () => response());
    await expect(importPrivateArtwork(owner, first.id)).rejects.toThrow();
    expect(createImmutableR2Artwork).not.toHaveBeenCalled();
  });

  it("rejects mismatched dimensions and a mismatched declared raster MIME", async () => {
    const wrong = await sharp({ create: { width: 20, height: 20, channels: 3, background: "black" } }).jpeg().toBuffer();
    fetchMock.mockImplementationOnce(async () => new Response(new Uint8Array(wrong), { headers: { "content-type": "image/jpeg" } }));
    await expect(importPrivateArtwork(owner, first.id)).rejects.toThrow("invalid_artwork_image");
    fetchMock.mockImplementationOnce(async () => new Response(new Uint8Array(image), { headers: { "content-type": "image/png" } }));
    await expect(importPrivateArtwork(owner, first.id)).rejects.toThrow("invalid_artwork_image");
    expect(createImmutableR2Artwork).not.toHaveBeenCalled();
  });

  it("does not activate a corrupt read-back or incomplete manifest; safely resumes a partial run", async () => {
    memory.corrupt = true;
    await expect(importPrivateArtwork(owner, first.id)).rejects.toThrow("artwork_verification_failed");
    expect([...memory.objects.keys()].some((key) => key.endsWith(".json"))).toBe(false);
    memory.corrupt = false; memory.failManifest = true;
    await expect(importPrivateArtwork(owner, first.id)).rejects.toThrow("manifest_write_failed");
    expect(await getPrivateArtworkSources(owner)).toEqual({});
    memory.failManifest = false;
    await expect(importPrivateArtwork(owner, first.id)).resolves.toMatchObject({ id: first.id });
    expect(memory.objects.size).toBe(4);
  });

  it("rejects corrupted stored bytes and never reads another owner's keys", async () => {
    await importPrivateArtwork(owner, first.id);
    memory.corrupt = true;
    await expect(getPrivateArtworkBytes(owner, first.id, 1280)).rejects.toThrow("artwork_verification_failed");
    const otherOwner = "00000000-0000-4000-8000-000000000000";
    expect(await getPrivateArtworkBytes(otherOwner, first.id, 1280)).toBeNull();
    expect(vi.mocked(readR2Artwork).mock.calls.at(-1)![0]).toContain(otherOwner);
  });
});
