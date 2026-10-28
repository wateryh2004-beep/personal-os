import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  delete: vi.fn(),
  sign: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/auth/require-owner", () => ({
  requireOwnerApi: async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    supabase: { from: state.from },
  }),
  apiAuthenticationFailure: () => null,
}));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({
  isR2Configured: () => true,
  r2BucketName: () => "private-bucket",
  createUploadUrl: state.sign,
}));

import { GET, POST } from "@/app/api/experience-library/upload-url/route";

function request(value: Record<string, unknown>) {
  return new Request("https://personal-os.example/api/experience-library/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

beforeEach(() => {
  state.from.mockReset().mockReturnValue({
    insert: state.insert,
    delete: state.delete,
  });
  state.insert.mockReset().mockResolvedValue({ error: null });
  state.delete.mockReset().mockReturnValue({
    eq: state.eq,
  });
  state.eq.mockReset().mockReturnValue({
    eq: state.eq,
  });
  state.sign.mockReset().mockResolvedValue("https://r2.example/private-put");
});

describe("Experience Library image preparation", () => {
  it("creates an owner-scoped pending document and preserves the verified completion boundary", async () => {
    const response = await POST(request({
      filename: "gpa.png",
      contentType: "image/png",
      size: 2048,
      checksum: "a".repeat(64),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      documentId: expect.any(String),
      uploadUrl: "https://r2.example/private-put",
    });
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "11111111-1111-4111-8111-111111111111",
      storage_provider: "cloudflare_r2",
      storage_state: "pending",
      checksum: "a".repeat(64),
      ai_visibility: "sensitive",
    }));
    expect(state.insert.mock.calls[0][0].storage_path).toMatch(
      /^11111111-1111-4111-8111-111111111111\/files\/[0-9a-f-]{36}\/gpa\.png$/,
    );
  });

  it("rejects SVG, executable-looking images and oversized originals before creating a record", async () => {
    for (const value of [
      { filename: "bad.svg", contentType: "image/svg+xml", size: 20 },
      { filename: "bad.exe", contentType: "image/png", size: 20 },
      { filename: "huge.png", contentType: "image/png", size: 15 * 1024 * 1024 + 1 },
    ]) {
      expect((await POST(request(value))).status).toBe(400);
    }
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("cleans only the pending record when signing fails", async () => {
    state.sign.mockRejectedValue(new Error("private provider detail"));
    expect((await POST(request({
      filename: "gpa.png",
      contentType: "image/png",
      size: 20,
    }))).status).toBe(503);
    expect(state.delete).toHaveBeenCalledOnce();
    expect(state.eq).toHaveBeenCalledWith("storage_state", "pending");
  });

  it("reissues a PUT only for the same owned pending raster and never for a missing foreign record", async () => {
    const documentId = "44444444-4444-4444-8444-444444444444";
    let row: Record<string, unknown> | null = { id: documentId, storage_path: `11111111-1111-4111-8111-111111111111/files/${documentId}/test.png`, storage_provider: "cloudflare_r2", storage_state: "pending", archived_at: null, mime_type: "image/png", original_filename: "test.png", file_size: 20 };
    const filters: [string, unknown][] = [];
    state.from.mockImplementation(() => {
      const builder = { select() { return builder; }, eq(key: string, value: unknown) { filters.push([key, value]); return builder; }, is(key: string, value: unknown) { filters.push([key, value]); return builder; }, maybeSingle: async () => ({ data: row, error: null }) };
      return builder;
    });
    const request = new Request(`https://personal-os.example/api/experience-library/upload-url?documentId=${documentId}`);
    expect(await (await GET(request)).json()).toMatchObject({ documentId, state: "pending", uploadUrl: "https://r2.example/private-put" });
    expect(filters).toContainEqual(["user_id", "11111111-1111-4111-8111-111111111111"]);
    expect(filters).toContainEqual(["vault_group_id", null]);
    state.sign.mockClear(); row = null;
    expect((await GET(request)).status).toBe(404);
    expect(state.sign).not.toHaveBeenCalled();
  });
});
