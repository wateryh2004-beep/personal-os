import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { experienceChunkCount, experienceChunkLength, experienceChunkSize } from "@/features/experience-library/chunks";

const userId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const image = Buffer.alloc(7 * 1024 * 1024, 42);
Buffer.from([137,80,78,71,13,10,26,10]).copy(image);
const state = vi.hoisted(() => ({ owner: vi.fn(), from: vi.fn(), sign: vi.fn(), read: vi.fn(), remove: vi.fn(), objects: new Map<string, Buffer>(), status: "pending" }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: state.owner, apiAuthenticationFailure: (error: unknown) => error === "anonymous" ? Response.json({ error: "需要登录" }, { status: 401 }) : null }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ isR2Configured: () => true, createUploadUrl: state.sign, readR2ObjectStream: state.read, deleteR2Object: state.remove }));
import { POST, PATCH, DELETE } from "@/app/api/experience-library/upload-chunks/route";

const originalPath = `${userId}/files/${documentId}/photo.png`;
function request(method: string, index?: number, bytes?: Buffer) {
  return new Request("https://personal-os.example/api/experience-library/upload-chunks", {
    method, headers: { origin: "https://personal-os.example", "x-experience-document-id": documentId, ...(index === undefined ? {} : { "x-experience-chunk-index": String(index) }) },
    ...(bytes ? { body: new Uint8Array(bytes).buffer } : {}),
  });
}
beforeEach(() => {
  state.objects.clear(); state.status = "pending";
  state.owner.mockReset().mockResolvedValue({ userId, supabase: { from: state.from } });
  state.from.mockImplementation(() => {
    const builder = { select() { return builder; }, eq() { return builder; }, is() { return builder; }, maybeSingle: async () => ({ error: null, data: { id: documentId, storage_path: state.status === "pending" ? originalPath : `${userId}/files/${documentId}/sealed-test/photo.png`, storage_provider: "cloudflare_r2", storage_state: state.status, mime_type: "image/png", original_filename: "photo.png", file_size: image.length, checksum: createHash("sha256").update(image).digest("hex") } }) };
    return builder;
  });
  state.sign.mockImplementation(async (key: string) => `https://r2.example/${encodeURIComponent(key)}`);
  state.read.mockImplementation(async (key: string) => {
    const value = state.objects.get(key); if (!value) throw new Error("missing");
    return { size: value.length, body: new ReadableStream({ start(controller) { controller.enqueue(value); controller.close(); } }) };
  });
  state.remove.mockImplementation(async (key: string) => { state.objects.delete(key); });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    state.objects.set(decodeURIComponent(new URL(url).pathname.slice(1)), Buffer.from(init.body as Buffer));
    return new Response(null, { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("relays a large image in bounded pieces, verifies all original bytes and cleans only confirmed temporary chunks", async () => {
  const count = experienceChunkCount(image.length);
  expect(count).toBe(3);
  for (let i = 0; i < count; i++) {
    const chunk = image.subarray(i * experienceChunkSize, i * experienceChunkSize + experienceChunkLength(image.length, i));
    expect((await POST(request("POST", i, chunk))).status).toBe(200);
  }
  expect((await PATCH(request("PATCH"))).status).toBe(200);
  expect(createHash("sha256").update(state.objects.get(originalPath)!).digest("hex")).toBe(createHash("sha256").update(image).digest("hex"));
  state.status = "available";
  expect((await DELETE(request("DELETE"))).status).toBe(200);
  expect(state.objects.get(originalPath)?.length).toBe(image.length);
  expect(state.remove).toHaveBeenCalledTimes(count);
});

it("never publishes a corrupted assembly or allows an anonymous request", async () => {
  for (let i = 0; i < experienceChunkCount(image.length); i++) {
    const value = Buffer.from(image.subarray(i * experienceChunkSize, i * experienceChunkSize + experienceChunkLength(image.length, i)));
    if (i === 1) value[0] ^= 1;
    await POST(request("POST", i, value));
  }
  expect((await PATCH(request("PATCH"))).status).toBe(409);
  expect(state.objects.has(originalPath)).toBe(false);
  state.owner.mockRejectedValue("anonymous");
  expect((await POST(request("POST", 0, image.subarray(0, experienceChunkSize)))).status).toBe(401);
});
