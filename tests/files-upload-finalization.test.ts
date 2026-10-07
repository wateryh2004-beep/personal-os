import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const ids = { user: "11111111-1111-4111-8111-111111111111", doc: "22222222-2222-4222-8222-222222222222" };
const state = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, stream: vi.fn(), copy: vi.fn(), deleted: vi.fn(), audits: 0, multipartReady: true, publish: vi.fn(), conflict: false, concurrentArchive: false }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: async () => ({ userId: ids.user, supabase: { from } }), apiAuthenticationFailure: () => null }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ isR2Configured: () => true, readR2ObjectStream: state.stream, copyVerifiedR2Object: state.copy, deleteR2Object: state.deleted, r2BucketName: () => "test", createUploadUrl: vi.fn() }));
vi.mock("@/features/files/multipart-service", () => ({ multipartIsReady: async () => state.multipartReady, publishMultipartFile: state.publish }));
import { PATCH, DELETE } from "@/app/api/files/upload-url/route";
function from(table: string) {
  let update: Record<string, unknown> | null = null; let deletion = false;
  const filters: [string, unknown][] = [];
  const query = {
    select() { return query; }, eq(k: string, v: unknown) { filters.push([k,v]); return query; }, is(k: string, v: unknown) { filters.push([k,v]); return query; },
    update(value: Record<string, unknown>) { update = value; return query; }, delete() { deletion = true; return query; },
    insert() { state.audits++; return Promise.resolve({ error: null }); },
    maybeSingle: async () => result(), then: (resolve: (v: unknown) => unknown) => Promise.resolve(result(true)).then(resolve),
  };
  function result(many = false) {
    if (table !== "documents") return { data: null, error: null };
    if ((update || deletion) && state.concurrentArchive && state.row) { state.row.storage_state = "archived"; state.row.archived_at = "now"; }
    const matches = state.row && filters.every(([k,v]) => state.row![k] === v);
    if (update && matches) state.row = { ...state.row, ...update };
    const row = matches ? { ...state.row } : null;
    if (deletion && matches) state.row = null;
    return { data: many ? (row ? [row] : []) : row, error: state.conflict && update ? { message: "uncertain" } : null };
  }
  return query;
}
function request() { return new Request("https://example.test/api/files/upload-url", { method: "PATCH", body: JSON.stringify({ documentId: ids.doc }), headers: { "content-type": "application/json" } }); }
beforeEach(() => {
  state.row = { id: ids.doc, user_id: ids.user, storage_provider: "cloudflare_r2", storage_state: "pending", upload_mode: "single", storage_path: `${ids.user}/files/${ids.doc}/test.txt`, archived_at: null, original_filename: "test.txt", file_size: 5, mime_type: "text/plain", checksum: createHash("sha256").update("hello").digest("hex"), text_extraction_status: "pending" };
  state.multipartReady = true;
  state.publish.mockReset().mockImplementation(async (_user: string, id: string, _source: string, finalPath: string) => {
    state.row = { ...state.row, storage_state: "available", storage_path: finalPath };
    return { data: { id }, error: null };
  });
  state.audits = 0; state.conflict = false; state.concurrentArchive = false;
  state.copy.mockReset().mockResolvedValue(undefined); state.deleted.mockReset();
  state.stream.mockReset().mockImplementation(async () => ({ size: 5, etag: '"source-version"', body: new ReadableStream({ start(c) { c.enqueue(Buffer.from("hello")); c.close(); } }) }));
});
describe("owner upload finalize", () => {
  it("seals verified bytes and accepts a lost-response retry without duplicate copy/audit", async () => {
    expect((await PATCH(request())).status).toBe(200);
    expect(state.row?.storage_state).toBe("available");
    expect(state.row?.storage_path).toContain("/sealed-");
    expect(state.copy.mock.calls[0][2]).toBe('"source-version"');
    const retry = await PATCH(request());
    expect(await retry.json()).toMatchObject({ ok: true, alreadyCompleted: true });
    expect(state.copy).toHaveBeenCalledTimes(1); expect(state.audits).toBe(1);
  });
  it("accepts legacy missing checksum while recording server-observed hash", async () => {
    state.row!.checksum = null;
    expect((await PATCH(request())).status).toBe(200);
    expect(state.row?.checksum).toBe(createHash("sha256").update("hello").digest("hex"));
  });
  it("rejects same-size corruption and leaves pending record intact", async () => {
    state.row!.checksum = "a".repeat(64);
    expect((await PATCH(request())).status).toBe(409);
    expect(state.row?.storage_state).toBe("pending"); expect(state.copy).not.toHaveBeenCalled();
  });
  it("fails closed if source changes during conditional copy", async () => {
    state.copy.mockRejectedValue({ $metadata: { httpStatusCode: 412 } });
    expect((await PATCH(request())).status).toBe(503);
    expect(state.row?.storage_state).toBe("pending");
  });
  it("rejects corrupt sealed bytes even after a successful conditional copy", async () => {
    state.stream.mockImplementationOnce(async () => ({ size: 5, etag: '\"source-version\"', body: new ReadableStream({ start(c) { c.enqueue(Buffer.from("hello")); c.close(); } }) }))
      .mockImplementationOnce(async () => ({ size: 5, etag: '\"copy-version\"', body: new ReadableStream({ start(c) { c.enqueue(Buffer.from("other")); c.close(); } }) }));
    expect((await PATCH(request())).status).toBe(409);
    expect(state.row?.storage_state).toBe("pending");
  });
  it("does not unarchive when archive wins the finalization race", async () => {
    state.concurrentArchive = true;
    expect((await PATCH(request())).status).toBe(409);
    expect(state.row?.storage_state).toBe("archived");
  });
  it("does not delete the original object when conditional pending deletion loses", async () => {
    state.concurrentArchive = true;
    expect((await DELETE(new Request(`https://example.test/api/files/upload-url?documentId=${ids.doc}`, { method: "DELETE" }))).status).toBe(409);
    expect(state.deleted).not.toHaveBeenCalled();
  });
  it("returns an uncertain result rather than a false success on database write errors", async () => {
    state.conflict = true;
    expect((await PATCH(request())).status).toBe(503);
    state.conflict = false;
    expect((await PATCH(request())).status).toBe(200);
  });
});


describe("multipart publication uses the atomic terminal boundary", () => {
  it("cannot finalize before server-side multipart verification", async () => {
    state.row!.upload_mode = "multipart"; state.multipartReady = false;
    expect((await PATCH(request())).status).toBe(409); expect(state.stream).not.toHaveBeenCalled(); expect(state.publish).not.toHaveBeenCalled();
  });
  it("publishes only the verified sealed candidate through the atomic RPC", async () => {
    state.row!.upload_mode = "multipart";
    expect((await PATCH(request())).status).toBe(200);
    expect(state.publish).toHaveBeenCalledWith(ids.user, ids.doc, expect.stringContaining("/test.txt"), expect.stringContaining("/sealed-"), expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(state.row?.storage_state).toBe("available");
  });
  it("does not publish after expired cancellation wins the document/session lock", async () => {
    state.row!.upload_mode = "multipart"; state.publish.mockResolvedValue({ data: null, error: null });
    expect((await PATCH(request())).status).toBe(409); expect(state.row?.storage_state).toBe("pending"); expect(state.audits).toBe(0);
  });
  it("legacy single-PUT cancellation cannot delete a multipart document", async () => {
    state.row!.upload_mode = "multipart";
    expect((await DELETE(new Request(`https://example.test/api/files/upload-url?documentId=${ids.doc}`, { method: "DELETE" }))).status).toBe(409);
    expect(state.deleted).not.toHaveBeenCalled(); expect(state.row).not.toBeNull();
  });
});
