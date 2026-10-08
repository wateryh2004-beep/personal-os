import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PDF_COVER_RENDERER_VERSION, pdfCoverKey } from "@/features/files/pdf-cover-policy";
const fake = vi.hoisted(() => ({ owner: vi.fn(), admin: vi.fn(), enqueue: vi.fn(), process: vi.fn(), read: vi.fn(), invalidate: vi.fn(), after: vi.fn(), configured: true }));
vi.mock("next/server", () => ({ after: fake.after }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: fake.owner, apiAuthenticationFailure: (error: unknown) => error === "unauthorized" ? Response.json({ error: "denied" }, { status: 401 }) : null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fake.admin }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ isR2Configured: () => fake.configured, r2BucketName: () => "private-test" }));
vi.mock("@/features/files/pdf-cover-service", async (original) => {
  const real = await original<typeof import("@/features/files/pdf-cover-service")>();
  return { ...real, enqueuePdfCover: fake.enqueue, processPdfCoverQueue: fake.process, readReadyPdfCover: fake.read, invalidatePdfCoverArtifact: fake.invalidate };
});
import { GET } from "@/app/api/files/[documentId]/pdf-cover/route";
import { PdfCoverArtifactError, type PdfCoverJob } from "@/features/files/pdf-cover-service";
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const checksum = "a".repeat(64), digest = "b".repeat(64);
let file: Record<string, unknown>;
let job: PdfCoverJob | null;
let queryError: unknown;
const lookups: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
const context = { params: Promise.resolve({ documentId: id }) };
function request(etag?: string) { return new Request(`https://fixture.test/api/files/${id}/pdf-cover`, { headers: etag ? { "If-None-Match": etag } : {} }); }
function from(table: string) {
  const filters: Array<[string, unknown]> = [];
  lookups.push({ table, filters });
  const query = {
    select: () => query, abortSignal: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    is: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    maybeSingle: async () => {
      const row = table === "documents" ? file : job;
      return { data: row && filters.every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value) ? row : null, error: queryError };
    },
  };
  return query;
}
function privateResponse(response: Response) {
  expect(response.headers.get("cache-control")).toContain("private");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(response.headers.get("location")).toBeNull();
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("PDF_COVERS_ENABLED", "true"); queryError = null; lookups.length = 0; fake.configured = true;
  file = { id, user_id: owner, storage_provider: "cloudflare_r2", storage_bucket: "private-test", storage_state: "available", archived_at: null,
    storage_path: `${owner}/files/${id}/sealed-fixture.pdf`, checksum, file_size: 100, mime_type: "application/pdf", original_filename: "private.pdf" };
  job = { document_id: id, user_id: owner, source_path: file.storage_path as string, source_bucket: "private-test", source_checksum: checksum,
    source_size: 100, renderer_version: PDF_COVER_RENDERER_VERSION, status: "ready", priority: 10, attempts: 1,
    next_attempt_at: null, lease_token: null, lease_expires_at: null, source_sha256: checksum, output_sha256: digest,
    storage_path: pdfCoverKey(owner, id, checksum), output_size: 4, width: 20, height: 30 };
  fake.owner.mockResolvedValue({ userId: owner, supabase: { from } }); fake.admin.mockReturnValue({ rpc: vi.fn() });
  fake.read.mockResolvedValue(Buffer.from("webp")); fake.enqueue.mockImplementation(async () => job);
  fake.process.mockResolvedValue({ status: "ready" }); fake.invalidate.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());
describe("owner-only cached PDF cover endpoint", () => {
  it("authorizes before checking feature flag, validators, or DB", async () => {
    vi.stubEnv("PDF_COVERS_ENABLED", "false"); fake.owner.mockRejectedValue("unauthorized");
    const response = await GET(request(`"${digest}"`), context);
    expect(response.status).toBe(401); privateResponse(response); expect(lookups).toEqual([]); expect(fake.admin).not.toHaveBeenCalled();
  });
  it("stays disabled without the explicit server opt-in", async () => {
    vi.stubEnv("PDF_COVERS_ENABLED", ""); const response = await GET(request(), context);
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ status: "disabled" }); expect(lookups).toEqual([]);
  });
  it.each([["user_id", "other"], ["storage_state", "archived"], ["archived_at", "now"], ["storage_bucket", "other"], ["storage_provider", "other"]])("rejects unavailable document %s even with a known ETag", async (key, value) => {
    file[key] = value; const response = await GET(request(`"${digest}"`), context);
    expect(response.status).toBe(404); privateResponse(response); expect(fake.read).not.toHaveBeenCalled(); expect(fake.enqueue).not.toHaveBeenCalled();
  });
  it("serves ready WebP without queue writes or rendering", async () => {
    const response = await GET(request(), context); expect(response.status).toBe(200); privateResponse(response);
    expect(response.headers.get("content-type")).toBe("image/webp"); expect(response.headers.get("etag")).toBe(`"${digest}"`);
    expect(response.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate"); expect(await response.text()).toBe("webp");
    expect(fake.admin).not.toHaveBeenCalled(); expect(fake.enqueue).not.toHaveBeenCalled(); expect(fake.after).not.toHaveBeenCalled(); expect(fake.process).not.toHaveBeenCalled();
    expect(lookups[1].filters).toEqual([["document_id", id], ["user_id", owner]]);
  });
  it("returns authenticated 304 without fetching R2 or mutating DB", async () => {
    const response = await GET(request(`W/"${digest}"`), context); expect(response.status).toBe(304); privateResponse(response);
    expect(fake.read).not.toHaveBeenCalled(); expect(fake.enqueue).not.toHaveBeenCalled(); expect(fake.admin).not.toHaveBeenCalled();
  });
  it("enqueues only missing work and returns before background renderer runs", async () => {
    const pending = { ...job!, status: "pending", source_sha256: null, output_sha256: null };
    job = null; fake.enqueue.mockResolvedValue(pending);
    const response = await GET(request(), context); expect(response.status).toBe(202); expect(response.headers.get("retry-after")).toBe("3");
    expect(fake.enqueue).toHaveBeenCalledOnce(); expect(fake.after).toHaveBeenCalledOnce(); expect(fake.process).not.toHaveBeenCalled(); expect(fake.read).not.toHaveBeenCalled();
    await fake.after.mock.calls[0][0](); expect(fake.process).toHaveBeenCalledOnce();
  });
  it("invalidates source and renderer changes before considering a cache validator", async () => {
    job!.renderer_version = "old-v1"; fake.enqueue.mockResolvedValue({ ...job!, status: "pending", renderer_version: PDF_COVER_RENDERER_VERSION });
    expect((await GET(request(`"${digest}"`), context)).status).toBe(202); expect(fake.read).not.toHaveBeenCalled(); expect(fake.enqueue).toHaveBeenCalled();
  });
  it("keeps permanent failures quiet and never re-enqueues them", async () => {
    job!.status = "failed"; job!.next_attempt_at = null;
    const response = await GET(request(), context); expect(response.status).toBe(422); expect(await response.json()).toEqual({ status: "failed" });
    expect(fake.enqueue).not.toHaveBeenCalled(); expect(fake.after).not.toHaveBeenCalled();
  });
  it("repairs a confirmed missing image with the existing retry budget", async () => {
    fake.read.mockRejectedValue(new PdfCoverArtifactError("missing"));
    expect((await GET(request(), context)).status).toBe(202); expect(fake.invalidate).toHaveBeenCalledWith(expect.anything(), job, "missing"); expect(fake.after).toHaveBeenCalledOnce();
  });
  it.each(["corrupt", "exhausted"])("does not overwrite or loop on %s derivatives", async (reason) => {
    if (reason === "exhausted") job!.attempts = 3;
    fake.read.mockRejectedValue(new PdfCoverArtifactError(reason === "corrupt" ? "corrupt" : "missing"));
    expect((await GET(request(), context)).status).toBe(422); expect(fake.invalidate).toHaveBeenCalledOnce(); expect(fake.after).not.toHaveBeenCalled();
  });
  it("does not invalidate metadata for transient R2 failures or leak provider details", async () => {
    fake.read.mockRejectedValue(new Error("secret object path / token")); const response = await GET(request(), context);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret"); expect(fake.invalidate).not.toHaveBeenCalled();
  });
  it("rejects incorrect owner paths and oversized documents without accessing the queue", async () => {
    file.storage_path = `other/files/${id}/private.pdf`; expect((await GET(request(), context)).status).toBe(404);
    file.storage_path = `${owner}/files/${id}/file.pdf`; file.file_size = 13 * 1024 * 1024; expect((await GET(request(), context)).status).toBe(413);
    expect(fake.enqueue).not.toHaveBeenCalled(); expect(fake.read).not.toHaveBeenCalled();
  });
});
