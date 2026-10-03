import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/files/upload-url/route";

const state = vi.hoisted(() => ({ from: vi.fn(), sign: vi.fn(), calls: [] as unknown[][], pending: null as unknown, lookupError: null as unknown }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: async () => ({ userId: "owner", supabase: { from: state.from } }), apiAuthenticationFailure: () => null }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ isR2Configured: () => true, r2BucketName: () => "private-bucket", createUploadUrl: state.sign, deleteR2Object: vi.fn(), objectExists: vi.fn() }));

const checksum = "a".repeat(64);
beforeEach(() => {
  state.calls = []; state.lookupError = null;
  state.pending = { id: "stable-document", title: "飞书原件", original_filename: "飞书原件.pdf", mime_type: "application/pdf", file_size: 1024, folder_id: null, storage_path: "owner/files/stable-document/original.pdf", text_extraction_status: "not_requested" };
  state.sign.mockReset().mockResolvedValue("https://r2.example/upload");
  state.from.mockReset().mockImplementation((table: string) => {
    const builder = {
      select(columns: string) { state.calls.push([table, "select", columns]); return this; },
      eq(key: string, value: unknown) { state.calls.push([table, "eq", key, value]); return this; },
      is(key: string, value: unknown) { state.calls.push([table, "is", key, value]); return this; },
      lt() { return this; }, order() { return this; }, limit() { return this; },
      insert(value: unknown) { state.calls.push([table, "insert", value]); return Promise.resolve({ error: null }); },
      maybeSingle() { return Promise.resolve({ data: state.pending, error: state.lookupError }); },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); },
    };
    return builder;
  });
});

function request(hash = checksum) {
  return new Request("https://personal-os.example/api/files/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: "staged.pdf", contentType: "application/pdf", size: 1024, checksum: hash }) });
}

describe("Owner-scoped upload resume", () => {
  it("reuses the pending document ID and original object path without inserting another file", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ documentId: "stable-document", resumed: true, file: { originalFilename: "飞书原件.pdf" } });
    expect(state.sign).toHaveBeenCalledWith("owner/files/stable-document/original.pdf", "application/pdf");
    expect(state.calls).toContainEqual(["documents", "eq", "user_id", "owner"]);
    expect(state.calls).toContainEqual(["documents", "eq", "checksum", checksum]);
    expect(state.calls).toContainEqual(["documents", "eq", "file_size", 1024]);
    expect(state.calls).toContainEqual(["documents", "eq", "storage_state", "pending"]);
    expect(state.calls.some((call) => call[1] === "insert")).toBe(false);
  });

  it("does not create duplicate records when the resume lookup fails", async () => {
    state.lookupError = { message: "unavailable" };
    expect((await POST(request())).status).toBe(500);
    expect(state.sign).not.toHaveBeenCalled();
    expect(state.calls.some((call) => call[1] === "insert")).toBe(false);
  });

  it("rejects malformed checksums before accessing storage", async () => {
    expect((await POST(request("invalid"))).status).toBe(400);
    expect(state.from).not.toHaveBeenCalled();
  });
});
