import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const state = vi.hoisted(() => ({ from: vi.fn(), sign: vi.fn(), fetch: vi.fn(), owner: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: state.owner, apiAuthenticationFailure: (error: unknown) => error === "anonymous" ? Response.json({ error: "需要登录" }, { status: 401 }) : null }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ isR2Configured: () => true, createUploadUrl: state.sign }));
import { POST } from "@/app/api/experience-library/upload-bytes/route";

beforeEach(() => {
  state.sign.mockReset().mockResolvedValue("https://r2.example/signed");
  state.fetch.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", state.fetch);
  state.owner.mockReset().mockResolvedValue({ userId, supabase: { from: state.from } });
  state.from.mockImplementation(() => {
    const builder = {
      select() { return builder; }, eq() { return builder; }, is() { return builder; },
      maybeSingle: async () => ({ error: null, data: { id: documentId, storage_path: `${userId}/files/${documentId}/test.png`, storage_provider: "cloudflare_r2", storage_state: "pending", mime_type: "image/png", original_filename: "test.png", file_size: bytes.length, checksum: createHash("sha256").update(bytes).digest("hex") } }),
    };
    return builder;
  });
});

function request(body: Uint8Array = bytes) {
  return new Request("https://personal-os.example/api/experience-library/upload-bytes", {
    method: "POST", headers: { "content-type": "image/png", "x-experience-document-id": documentId, origin: "https://personal-os.example" }, body: new Uint8Array(body).buffer,
  });
}

it("relays exact owner-scoped bytes to private storage without publishing the document", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(state.sign).toHaveBeenCalledWith(`${userId}/files/${documentId}/test.png`, "image/png");
  expect(state.fetch).toHaveBeenCalledWith("https://r2.example/signed", expect.objectContaining({ method: "PUT", body: Buffer.from(bytes) }));
  expect(state.from).toHaveBeenCalledOnce();
});

it("refuses changed bytes and anonymous requests before contacting storage", async () => {
  expect((await POST(request(Uint8Array.from([137,80,78,71,13,10,26,10,9,9,9])))).status).toBe(409);
  expect(state.fetch).not.toHaveBeenCalled();
  state.owner.mockRejectedValue("anonymous");
  expect((await POST(request())).status).toBe(401);
  expect(state.sign).not.toHaveBeenCalled();
});
