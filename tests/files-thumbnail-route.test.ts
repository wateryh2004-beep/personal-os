import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), read: vi.fn(), configured: true }));
vi.mock("@/lib/auth/require-owner", () => ({
  requireOwnerApi: mocks.owner,
  apiAuthenticationFailure: (error: unknown) => error === "unauthenticated" || error === "not-authorized"
    ? Response.json({ error: "denied" }, { status: error === "unauthenticated" ? 401 : 403 }) : null,
}));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ isR2Configured: () => mocks.configured, r2BucketName: () => "private-test-bucket", readR2ObjectStream: mocks.read }));

import { GET } from "@/app/api/files/[documentId]/thumbnail/route";
import { maxPhotoPreviewInputBytes } from "@/features/files/photo-thumbnail";

const ownerId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const path = `${ownerId}/files/${documentId}/sealed-fixture/photo.png`;
const context = { params: Promise.resolve({ documentId }) };
const request = (signal?: AbortSignal) => new Request(`https://example.test/api/files/${documentId}/thumbnail`, { signal });
let photo: Buffer;
let record: Record<string, unknown>;
let conditions: Array<[string, unknown]>;
const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn() };
const from = vi.fn();
let queryError: object | null;

beforeAll(async () => { photo = await sharp({ create: { width: 40, height: 20, channels: 4, background: "#ee4422" } }).png().toBuffer(); });
beforeEach(() => {
  vi.clearAllMocks();
  conditions = [];
  queryError = null;
  record = { id: documentId, user_id: ownerId, storage_path: path, storage_provider: "cloudflare_r2", storage_bucket: "private-test-bucket", storage_state: "available", archived_at: null, mime_type: "image/png", file_size: photo.byteLength };
  query.select.mockReturnValue(query);
  query.eq.mockImplementation((field, value) => { conditions.push([field, value]); return query; });
  query.is.mockImplementation((field, value) => { conditions.push([field, value]); return query; });
  query.maybeSingle.mockImplementation(async () => ({ data: conditions.every(([key, value]) => record[key] === value) ? record : null, error: queryError }));
  from.mockReturnValue(query);
  mocks.owner.mockResolvedValue({ userId: ownerId, supabase: { from } });
  mocks.configured = true;
  mocks.read.mockImplementation(async () => ({ size: photo.byteLength, body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(photo); c.close(); } }) }));
});

function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(response.headers.get("location")).toBeNull();
}

describe("private Files photo thumbnail route", () => {
  it.each(["unauthenticated", "not-authorized"])("requires owner authentication before file lookup (%s)", async (failure) => {
    mocks.owner.mockRejectedValue(failure);
    const response = await GET(request(), context);
    expect(response.status).toBe(failure === "unauthenticated" ? 401 : 403);
    expectPrivate(response);
    expect(from).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("supports generic legacy PNG metadata only after validating the raster bytes", async () => {
    record.mime_type = "application/octet-stream"; record.original_filename = "legacy.PNG";
    const response = await GET(request(), context);
    expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("image/webp");
  });

  it("serves only a transformed, owner-scoped WebP with private response headers", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-disposition")).toBe("inline");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.equals(photo)).toBe(false);
    expect(await sharp(bytes).metadata()).toMatchObject({ format: "webp", width: 40, height: 20 });
    expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(conditions).toEqual([
      ["id", documentId], ["user_id", ownerId], ["storage_provider", "cloudflare_r2"], ["storage_bucket", "private-test-bucket"], ["storage_state", "available"], ["archived_at", null],
    ]);
    expect(mocks.read).toHaveBeenCalledWith(path, expect.any(AbortSignal));
  });

  it.each([
    ["user_id", "33333333-3333-4333-8333-333333333333"], ["storage_provider", "supabase"],
    ["storage_bucket", "old-test-bucket"], ["storage_state", "pending"], ["archived_at", "2026-10-06T12:00:00Z"],
  ])("does not read an unavailable record (%s)", async (field, value) => {
    record[field] = value;
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expectPrivate(response);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("rejects invalid IDs, absent configuration, and failed file queries without reading originals", async () => {
    expect((await GET(request(), { params: Promise.resolve({ documentId: "invalid" }) })).status).toBe(404);
    mocks.configured = false;
    expect((await GET(request(), context)).status).toBe(503);
    mocks.configured = true;
    queryError = { message: "query unavailable" };
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it.each(["image/svg+xml", "image/heic", "application/pdf"])("leaves %s on a placeholder without fetching it", async (mime) => {
    record.mime_type = mime;
    const response = await GET(request(), context);
    expect(response.status).toBe(415);
    expectPrivate(response);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("does not fetch an original above the preview budget", async () => {
    record.file_size = maxPhotoPreviewInputBytes + 1;
    const response = await GET(request(), context);
    expect(response.status).toBe(413);
    expectPrivate(response);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("cancels a returned source whose size no longer matches the file record", async () => {
    const cancel = vi.fn();
    mocks.read.mockResolvedValue({ size: maxPhotoPreviewInputBytes + 1, body: new ReadableStream({ cancel }) });
    const response = await GET(request(), context);
    expect(response.status).toBe(422);
    expectPrivate(response);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("returns a safe placeholder response for incomplete photo bytes or unavailable storage", async () => {
    const incomplete = photo.subarray(0, 40);
    record.file_size = incomplete.byteLength;
    mocks.read.mockResolvedValue({ size: incomplete.byteLength, body: new ReadableStream({ start(c) { c.enqueue(incomplete); c.close(); } }) });
    const response = await GET(request(), context);
    expect(response.status).toBe(422);
    expectPrivate(response);
    mocks.read.mockRejectedValue(new Error("private-provider-detail"));
    const failed = await GET(request(), context);
    expect(failed.status).toBe(503);
    expectPrivate(failed);
    expect(await failed.text()).not.toContain("private-provider-detail");
  });

  it("does not read an original after the browser has cancelled the request", async () => {
    const controller = new AbortController();
    controller.abort();
    const response = await GET(request(controller.signal), context);
    expect(response.status).toBe(503);
    expectPrivate(response);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
