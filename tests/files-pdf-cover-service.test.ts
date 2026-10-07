import { createHash } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PDF_COVER_RENDERER_VERSION, pdfCoverKey } from "@/features/files/pdf-cover-policy";
const fake = vi.hoisted(() => ({ after: vi.fn(), admin: vi.fn(), read: vi.fn(), write: vi.fn(), artifact: vi.fn(), render: vi.fn() }));
vi.mock("next/server", () => ({ after: fake.after }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fake.admin }));
vi.mock("@/lib/adapters/cloudflare-r2", () => ({ isR2Configured: () => true, r2BucketName: () => "private-test", readR2ObjectStream: fake.read,
  createImmutableR2PdfCover: fake.write, readR2PdfCover: fake.artifact }));
vi.mock("@/lib/adapters/pdf-cover-renderer", () => ({ renderPdfCover: fake.render }));
import { enqueuePdfCover, processPdfCoverQueue, readPdfCoverSource, readReadyPdfCover, scheduleUploadedPdfCover, PdfCoverArtifactError, type PdfCoverJob } from "@/features/files/pdf-cover-service";
const owner = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const source = Buffer.from("%PDF-1.7\nsynthetic");
const output = Buffer.from("RIFFfakeWEBPsynthetic");
const checksum = createHash("sha256").update(source).digest("hex");
const outputDigest = createHash("sha256").update(output).digest("hex");
let job: PdfCoverJob;
let file: Record<string, unknown> | null;
let sourceReads: Array<AbortSignal | undefined>;
let sourceQuery: (() => Promise<{ data: Record<string, unknown> | null; error: unknown }>) | null;
let finishData: boolean;
let finishError: unknown;
const calls: Array<{ name: string; args: Record<string, unknown>; signal?: AbortSignal }> = [];
function dbPromise<T>(value: Promise<T>, call?: { signal?: AbortSignal }) {
  return Object.assign(value, { abortSignal(signal: AbortSignal) { if (call) call.signal = signal; return value; } });
}
const db = {
  rpc(name: string, args: Record<string, unknown>) {
    const call: (typeof calls)[number] = { name, args }; calls.push(call);
    return dbPromise(Promise.resolve(name === "claim_pdf_cover" || name === "enqueue_pdf_cover" ? { data: [job], error: null } : { data: finishData, error: finishError }), call);
  },
  from() {
    let signal: AbortSignal | undefined;
    const query = { select: () => query, eq: () => query, is: () => query, abortSignal: (value: AbortSignal) => { signal = value; return query; },
      maybeSingle: async () => { sourceReads.push(signal); return sourceQuery ? sourceQuery() : { data: file, error: null }; },
    }; return query;
  },
};
const typedDb = db as unknown as Parameters<typeof processPdfCoverQueue>[0];
function stream(bytes: Uint8Array) { return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }); }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("PDF_COVERS_ENABLED", "true"); calls.length = 0; sourceReads = []; sourceQuery = null; finishData = true; finishError = null;
  job = { document_id: id, user_id: owner, source_path: `${owner}/files/${id}/sealed-fixture.pdf`, source_bucket: "private-test", source_checksum: checksum,
    source_size: source.byteLength, renderer_version: PDF_COVER_RENDERER_VERSION, status: "processing", priority: 10, attempts: 1,
    next_attempt_at: null, lease_token: "33333333-3333-4333-8333-333333333333", lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    source_sha256: null, output_sha256: null, storage_path: null, output_size: null, width: null, height: null };
  file = { id, user_id: owner, storage_path: job.source_path, storage_bucket: "private-test", checksum, file_size: source.byteLength, mime_type: "application/pdf", original_filename: "fixture.pdf" };
  fake.read.mockImplementation(async () => ({ size: source.byteLength, body: stream(source) }));
  fake.render.mockResolvedValue({ bytes: output, width: 20, height: 30 }); fake.write.mockResolvedValue(undefined); fake.artifact.mockResolvedValue(output);
  fake.admin.mockReturnValue(typedDb);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("durable PDF cover job service", () => {
  it("keeps disabled deployments completely idle", async () => {
    vi.stubEnv("PDF_COVERS_ENABLED", "false"); expect(await processPdfCoverQueue(typedDb, owner)).toEqual({ status: "disabled" });
    scheduleUploadedPdfCover(owner, id); expect(calls).toEqual([]); expect(fake.after).not.toHaveBeenCalled();
  });
  it("verifies source hash, immutable write/readback and lease-token publication", async () => {
    expect(await processPdfCoverQueue(typedDb, owner, id)).toEqual({ status: "ready" });
    expect(calls[0]).toMatchObject({ name: "claim_pdf_cover", args: { p_user_id: owner, p_document_id: id, p_renderer_version: PDF_COVER_RENDERER_VERSION } });
    expect(fake.write).toHaveBeenCalledWith(pdfCoverKey(owner, id, checksum), output, expect.any(AbortSignal));
    expect(calls.at(-1)).toMatchObject({ name: "finish_pdf_cover", args: { p_user_id: owner, p_document_id: id, p_lease_token: job.lease_token, p_success: true,
      p_source_sha256: checksum, p_output_sha256: outputDigest, p_output_size: output.byteLength, p_width: 20, p_height: 30 }, signal: expect.any(AbortSignal) });
    expect(sourceReads).toHaveLength(2); expect(sourceReads.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });
  it("hashes legacy checksum-free source before forming its immutable key", async () => {
    job.source_checksum = null; file!.checksum = null;
    expect(await processPdfCoverQueue(typedDb, owner)).toEqual({ status: "ready" }); expect(fake.write.mock.calls[0][0]).toBe(pdfCoverKey(owner, id, checksum));
  });
  it("does not render after an unavailable/archived source is filtered out", async () => {
    file = null; expect(await processPdfCoverQueue(typedDb, owner)).toEqual({ status: "failed" }); expect(fake.read).not.toHaveBeenCalled(); expect(fake.render).not.toHaveBeenCalled();
  });
  it("does not read bytes for another owner's claimed job", async () => {
    job.user_id = "other-owner"; await processPdfCoverQueue(typedDb, owner); expect(fake.read).not.toHaveBeenCalled(); expect(fake.write).not.toHaveBeenCalled();
  });
  it("rejects an already expired lease without original read or render", async () => {
    job.lease_expires_at = new Date(Date.now() - 1).toISOString(); await processPdfCoverQueue(typedDb, owner);
    expect(sourceReads).toHaveLength(0); expect(fake.read).not.toHaveBeenCalled(); expect(fake.render).not.toHaveBeenCalled();
  });
  it("a source query suspended past lease expiry cannot start an overlapping render", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const start = Date.now();
    let resolve!: (value: { data: Record<string, unknown> | null; error: unknown }) => void;
    sourceQuery = () => new Promise((finish) => { resolve = finish; });
    const running = processPdfCoverQueue(typedDb, owner);
    await Promise.resolve(); await Promise.resolve();
    expect(sourceReads[0]).toBeInstanceOf(AbortSignal);
    vi.setSystemTime(start + 61_000); resolve({ data: file, error: null });
    expect(await running).toEqual({ status: "failed" }); expect(fake.read).not.toHaveBeenCalled(); expect(fake.render).not.toHaveBeenCalled();
  });
  it("rejects checksum and size mismatches permanently before rendering", async () => {
    job.source_checksum = "a".repeat(64); file!.checksum = job.source_checksum;
    await processPdfCoverQueue(typedDb, owner);
    expect(fake.render).not.toHaveBeenCalled(); expect(calls.at(-1)?.args).toMatchObject({ p_success: false, p_error_code: "pdf_cover_checksum_mismatch", p_retryable: false });
  });
  it("cancels mismatched R2 objects instead of buffering them", async () => {
    const cancel = vi.fn(); fake.read.mockResolvedValue({ size: 99, body: new ReadableStream({ cancel }) });
    await processPdfCoverQueue(typedDb, owner); expect(cancel).toHaveBeenCalledOnce(); expect(fake.render).not.toHaveBeenCalled();
  });
  it.each([["pdf_cover_encrypted", false], ["pdf_cover_invalid", false], ["pdf_cover_too_many_pages", false], ["pdf_cover_timeout", true], ["unsafe provider / secret key", true]])("classifies %s without leaking raw errors", async (code, retry) => {
    fake.render.mockRejectedValue(new Error(code)); await processPdfCoverQueue(typedDb, owner);
    expect(calls.at(-1)?.args).toMatchObject({ p_success: false, p_retryable: retry, p_error_code: retry ? "pdf_cover_unavailable" : code });
    expect(fake.write).not.toHaveBeenCalled();
  });
  it("checks the source again before storing a derivative", async () => {
    fake.render.mockImplementation(async () => { file!.checksum = "f".repeat(64); return { bytes: output, width: 20, height: 30 }; });
    await processPdfCoverQueue(typedDb, owner); expect(fake.write).not.toHaveBeenCalled();
  });
  it("never publishes a corrupted immutable readback", async () => {
    fake.artifact.mockResolvedValue(Buffer.from("corrupt")); await processPdfCoverQueue(typedDb, owner);
    expect(calls.at(-1)?.args).toMatchObject({ p_success: false, p_error_code: "pdf_cover_invalid_output", p_retryable: false });
  });
  it("reports a lost completion CAS without treating stale work as published", async () => {
    finishData = false; expect(await processPdfCoverQueue(typedDb, owner)).toEqual({ status: "stale" });
  });
  it("registers all upload queue I/O after response, even if enqueue never resolves", async () => {
    let enqueueStarted = false;
    fake.admin.mockReturnValue({ rpc: () => { enqueueStarted = true; return dbPromise(new Promise(() => {})); } });
    expect(scheduleUploadedPdfCover(owner, id)).toBeUndefined(); expect(fake.after).toHaveBeenCalledOnce(); expect(enqueueStarted).toBe(false); expect(fake.admin).not.toHaveBeenCalled();
    void fake.after.mock.calls[0][0](); expect(enqueueStarted).toBe(true);
    // No reference to the unresolved enqueue promise is returned to upload completion.
  });
  it("absorbs after registration failures instead of failing successful uploads", () => {
    fake.after.mockImplementationOnce(() => { throw new Error("closed response"); }); expect(() => scheduleUploadedPdfCover(owner, id)).not.toThrow();
  });
  it("does not expose database errors from enqueue", async () => {
    const broken = { rpc: () => dbPromise(Promise.resolve({ data: null, error: { message: "credential or private path" } })) } as unknown as typeof typedDb;
    await expect(enqueuePdfCover(broken, owner, id)).rejects.toThrow("pdf_cover_queue_unavailable");
  });
});
describe("bounded source and ready artifact reads", () => {
  it("detects truncation and overflow", async () => {
    await expect(readPdfCoverSource(stream(source.subarray(0, 8)), source.byteLength, null, AbortSignal.timeout(1000))).rejects.toThrow("pdf_cover_size_mismatch");
    await expect(readPdfCoverSource(stream(source), 8, null, AbortSignal.timeout(1000))).rejects.toThrow("pdf_cover_size_mismatch");
  });
  it("cancels an upstream stalled read on abort", async () => {
    const cancel = vi.fn(); const controller = new AbortController();
    const reading = readPdfCoverSource(new ReadableStream({ cancel }), 100, null, controller.signal);
    controller.abort(); await expect(reading).rejects.toThrow(); expect(cancel).toHaveBeenCalledOnce();
  });
  it("only reads the derived key and distinguishes absence, corruption and outages", async () => {
    job = { ...job, status: "ready", source_sha256: checksum, output_sha256: outputDigest, output_size: output.byteLength, storage_path: pdfCoverKey(owner, id, checksum) };
    expect(await readReadyPdfCover(job, owner)).toEqual(output); expect(fake.read).not.toHaveBeenCalled(); expect(fake.render).not.toHaveBeenCalled();
    fake.artifact.mockResolvedValue(null); await expect(readReadyPdfCover(job, owner)).rejects.toMatchObject({ reason: "missing" });
    fake.artifact.mockResolvedValue(Buffer.from("bad")); await expect(readReadyPdfCover(job, owner)).rejects.toBeInstanceOf(PdfCoverArtifactError);
    fake.artifact.mockRejectedValue(new Error("network")); await expect(readReadyPdfCover(job, owner)).rejects.toThrow("network");
  });
});
