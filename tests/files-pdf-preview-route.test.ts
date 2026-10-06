import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), read: vi.fn(), configured: true }));
vi.mock("@/lib/auth/require-owner", () => ({
  requireOwnerApi: mocks.owner,
  apiAuthenticationFailure: (error: unknown) => error === "unauthenticated" || error === "not-authorized"
    ? Response.json({ error: "denied" }, { status: error === "unauthenticated" ? 401 : 403 }) : null,
}));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({
  isR2Configured: () => mocks.configured, r2BucketName: () => "private-test-bucket", readR2ObjectSlice: mocks.read,
}));
import { GET, HEAD } from "@/app/api/files/[documentId]/preview/route";
import { maxFileSize } from "@/features/files/schemas";

const ownerId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const path = `${ownerId}/files/${documentId}/sealed-fixture/test.pdf`;
const context = { params: Promise.resolve({ documentId }) };
const request = (headers: HeadersInit = {}, signal?: AbortSignal) => new Request(`https://example.test/api/files/${documentId}/preview`, { headers, signal });
const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const etag = '"synthetic-pdf-version"';
let record: Record<string, unknown>;
let conditions: Array<[string, unknown]>;
const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn() };
const from = vi.fn();

function body(bytes: Uint8Array, cancel = vi.fn()) {
  let sent = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) { if (!sent) { sent = true; controller.enqueue(bytes); } else controller.close(); }, cancel,
  }, { highWaterMark: 0 });
}
function object(range?: { start: number; end: number }) {
  const selected = range ? pdf.slice(range.start, range.end + 1) : pdf;
  return { body: body(selected), size: selected.byteLength, etag, contentRange: range ? `bytes ${range.start}-${range.end}/${pdf.byteLength}` : null };
}
beforeEach(() => {
  vi.clearAllMocks();
  conditions = [];
  record = { id: documentId, user_id: ownerId, storage_path: path, storage_provider: "cloudflare_r2", storage_bucket: "private-test-bucket", storage_state: "available", archived_at: null, mime_type: "application/pdf", file_size: pdf.byteLength, original_filename: "测试文档.pdf" };
  query.select.mockReturnValue(query);
  query.eq.mockImplementation((field, value) => { conditions.push([field, value]); return query; });
  query.is.mockImplementation((field, value) => { conditions.push([field, value]); return query; });
  query.maybeSingle.mockImplementation(async () => ({ data: conditions.every(([key, value]) => record[key] === value) ? record : null, error: null }));
  from.mockReturnValue(query);
  mocks.owner.mockResolvedValue({ userId: ownerId, supabase: { from } });
  mocks.configured = true;
  mocks.read.mockImplementation(async (_key, options) => object(options.range));
});

function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  expect(response.headers.get("content-security-policy")).toBeNull();
  expect(response.headers.get("location")).toBeNull();
}

describe("private Files PDF preview route", () => {
  it.each(["unauthenticated", "not-authorized"])("requires owner authentication before PDF lookup (%s)", async (failure) => {
    mocks.owner.mockRejectedValue(failure);
    const response = await GET(request(), context);
    expect(response.status).toBe(failure === "unauthenticated" ? 401 : 403);
    expectPrivate(response);
    expect(from).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("serves an authenticated inline PDF through a bounded-prefix then conditional full read", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe("inline; filename=\"document.pdf\"; filename*=UTF-8''%E6%B5%8B%E8%AF%95%E6%96%87%E6%A1%A3.pdf");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe(String(pdf.byteLength));
    expect(response.headers.get("content-range")).toBeNull();
    expect(response.headers.get("etag")).toBe(etag);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);
    expect(mocks.read).toHaveBeenNthCalledWith(1, path, { range: { start: 0, end: 7 }, signal: expect.any(AbortSignal) });
    expect(mocks.read).toHaveBeenNthCalledWith(2, path, { ifMatch: etag, signal: expect.any(AbortSignal) });
    expect(conditions).toEqual([
      ["id", documentId], ["user_id", ownerId], ["storage_provider", "cloudflare_r2"], ["storage_bucket", "private-test-bucket"], ["storage_state", "available"], ["archived_at", null],
    ]);
  });
  it.each([
    ["bytes=0-0", 0, 0], ["bytes=10-19", 10, 19], ["bytes=30-", 30, pdf.byteLength - 1],
    ["bytes=-10", pdf.byteLength - 10, pdf.byteLength - 1], ["bytes=0-999", 0, pdf.byteLength - 1],
  ])("returns 206 with the exact requested bytes for %s", async (range, start, end) => {
    const response = await GET(request({ Range: range }), context);
    expect(response.status).toBe(206);
    expectPrivate(response);
    expect(response.headers.get("content-range")).toBe(`bytes ${start}-${end}/${pdf.byteLength}`);
    expect(response.headers.get("content-length")).toBe(String(end - start + 1));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf.slice(start, end + 1));
    expect(mocks.read).toHaveBeenNthCalledWith(2, path, { range: { start, end }, ifMatch: etag, signal: expect.any(AbortSignal) });
  });
  it.each(["bytes=999-1000", "bytes=0-1,2-3", "bytes=bad", "bytes=-0"])("returns 416 without an object read for %s", async (range) => {
    const response = await GET(request({ Range: range }), context);
    expect(response.status).toBe(416);
    expectPrivate(response);
    expect(response.headers.get("content-range")).toBe(`bytes */${pdf.byteLength}`);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("honors a matching If-Range ETag", async () => {
    const response = await GET(request({ Range: "bytes=10-19", "If-Range": etag }), context);
    expect(response.status).toBe(206);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf.slice(10, 20));
  });
  it.each(['"stale"', `W/${etag}`, "Tue, 06 Oct 2026 10:00:00 GMT"])("uses a full response for an unmatched If-Range validator %s", async (validator) => {
    const response = await GET(request({ Range: "bytes=10-19", "If-Range": validator }), context);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);
    expect(mocks.read.mock.calls[1][1].range).toBeUndefined();
  });
  it("HEAD reads only eight signature bytes and ignores Range without a response body", async () => {
    const response = await HEAD(request({ Range: "bytes=bad" }), context);
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-length")).toBe(String(pdf.byteLength));
    expect(response.body).toBeNull();
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(mocks.read.mock.calls[0][1].range).toEqual({ start: 0, end: 7 });
  });
  it.each([
    ["user_id", "33333333-3333-4333-8333-333333333333"], ["storage_provider", "supabase"],
    ["storage_bucket", "old-test-bucket"], ["storage_state", "pending"], ["archived_at", "2026-10-06T12:00:00Z"],
    ["storage_path", "other/files/doc/file.pdf"],
  ])("does not read a PDF when its current file record is unavailable (%s)", async (field, value) => {
    record[field] = value;
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expectPrivate(response);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("does not read missing IDs, unconfigured storage, or failed lookups", async () => {
    expect((await GET(request(), { params: Promise.resolve({ documentId: "invalid" }) })).status).toBe(404);
    mocks.configured = false;
    expect((await GET(request(), context)).status).toBe(503);
    mocks.configured = true;
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "synthetic query error" } });
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("keeps unsupported files and oversized PDFs on download fallback without reading them", async () => {
    record.mime_type = "text/html";
    expect((await GET(request(), context)).status).toBe(415);
    record.mime_type = "application/pdf";
    record.file_size = maxFileSize + 1;
    expect((await GET(request(), context)).status).toBe(413);
    record.file_size = 7;
    expect((await GET(request(), context)).status).toBe(422);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects invalid PDF signatures before requesting the body", async () => {
    mocks.read.mockResolvedValue({ ...object({ start: 0, end: 7 }), body: body(new TextEncoder().encode("<html>hi")) });
    const response = await GET(request(), context);
    expect(response.status).toBe(422);
    expectPrivate(response);
    expect(mocks.read).toHaveBeenCalledOnce();
  });
  it("previews a legacy generic upload only when its .pdf filename and actual signature agree", async () => {
    record.mime_type = "application/octet-stream";
    record.original_filename = "legacy.PDF";
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);
    record.original_filename = "legacy.bin";
    expect((await GET(request(), context)).status).toBe(415);
    record.original_filename = "disguised.pdf";
    mocks.read.mockResolvedValue({ ...object({ start: 0, end: 7 }), body: body(new TextEncoder().encode("<html>hi")) });
    expect((await GET(request(), context)).status).toBe(422);
  });
  it("cancels an ignored range or changed total size before buffering the prefix", async () => {
    const cancel = vi.fn();
    mocks.read.mockResolvedValue({ size: pdf.byteLength, etag, contentRange: null, body: new ReadableStream({ cancel }) });
    expect((await GET(request(), context)).status).toBe(422);
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledOnce();
  });
  it("does not fall back to an unconditional stream after a version change", async () => {
    mocks.read.mockResolvedValueOnce(object({ start: 0, end: 7 })).mockRejectedValueOnce({ $metadata: { httpStatusCode: 412 }, message: "private provider detail" });
    const response = await GET(request(), context);
    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(await response.text()).not.toContain("private provider detail");
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it("cancels a returned stream with a changed ETag before returning PDF bytes", async () => {
    const cancel = vi.fn();
    mocks.read.mockResolvedValueOnce(object({ start: 0, end: 7 }))
      .mockResolvedValueOnce({ ...object(), etag: '"new-version"', body: new ReadableStream({ cancel }) });
    expect((await GET(request(), context)).status).toBe(422);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("fails a truncated content stream rather than treating it as a complete preview", async () => {
    mocks.read.mockResolvedValueOnce(object({ start: 0, end: 7 }))
      .mockResolvedValueOnce({ ...object(), body: body(pdf.slice(0, 12)) });
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    await expect(response.arrayBuffer()).rejects.toThrow("pdf_preview_invalid");
  });
  it("propagates downstream cancellation to the content source", async () => {
    const cancel = vi.fn();
    mocks.read.mockResolvedValueOnce(object({ start: 0, end: 7 }))
      .mockResolvedValueOnce({ ...object(), body: new ReadableStream({ cancel }) });
    const response = await GET(request(), context);
    await response.body!.cancel();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("does not start a PDF read for an already-cancelled request", async () => {
    const controller = new AbortController(); controller.abort();
    const response = await GET(request({}, controller.signal), context);
    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("keeps HEAD errors bodyless and private", async () => {
    mocks.owner.mockRejectedValue("unauthenticated");
    const response = await HEAD(request(), context);
    expect(response.status).toBe(401);
    expect(response.body).toBeNull();
    expectPrivate(response);
    mocks.owner.mockResolvedValue({ userId: ownerId, supabase: { from } });
    record.mime_type = "text/html";
    const unsupported = await HEAD(request(), context);
    expect(unsupported.status).toBe(415);
    expect(unsupported.body).toBeNull();
  });
});
