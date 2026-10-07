import "server-only";

import { createHash } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createImmutableR2PdfCover, isR2Configured, r2BucketName, readR2ObjectStream, readR2PdfCover,
} from "@/lib/adapters/cloudflare-r2";
import { renderPdfCover } from "@/lib/adapters/pdf-cover-renderer";
import { supportsPdfPreview } from "./pdf-preview";
import {
  PDF_COVER_DATABASE_TIMEOUT_MS, PDF_COVER_JOB_TIMEOUT_MS, PDF_COVER_MAX_EDGE, PDF_COVER_MAX_OUTPUT_BYTES, PDF_COVER_MAX_SOURCE_BYTES,
  PDF_COVER_RENDERER_VERSION, pdfCoverFailure, pdfCoverKey, pdfCoversEnabled,
} from "./pdf-cover-policy";

type Database = ReturnType<typeof createAdminClient>;
export type PdfCoverSource = {
  id: string; user_id: string; storage_path: string; storage_bucket: string; checksum: string | null;
  file_size: number; mime_type: string; original_filename: string;
};
export type PdfCoverJob = {
  document_id: string; user_id: string; source_path: string; source_bucket: string; source_checksum: string | null;
  source_size: number; renderer_version: string; status: "pending" | "processing" | "ready" | "failed";
  priority: number; attempts: number; next_attempt_at: string | null; lease_token: string | null; lease_expires_at: string | null;
  source_sha256: string | null; output_sha256: string | null; storage_path: string | null;
  output_size: number | null; width: number | null; height: number | null;
};

export const pdfCoverSourceColumns = "id,user_id,storage_path,storage_bucket,checksum,file_size,mime_type,original_filename";

export function pdfCoverMatchesSource(job: PdfCoverJob, file: PdfCoverSource, userId: string) {
  return job.document_id === file.id && job.user_id === userId && file.user_id === userId &&
    job.source_path === file.storage_path && job.source_bucket === file.storage_bucket &&
    Number(job.source_size) === Number(file.file_size) && job.source_checksum === file.checksum &&
    job.renderer_version === PDF_COVER_RENDERER_VERSION;
}

export async function enqueuePdfCover(db: Database, userId: string, documentId: string, priority = 10, signal = AbortSignal.timeout(PDF_COVER_DATABASE_TIMEOUT_MS)): Promise<PdfCoverJob | null> {
  const { data, error } = await db.rpc("enqueue_pdf_cover", {
    p_user_id: userId, p_document_id: documentId, p_renderer_version: PDF_COVER_RENDERER_VERSION,
    p_bucket: r2BucketName(), p_priority: priority,
  }).abortSignal(signal);
  if (error) throw new Error("pdf_cover_queue_unavailable");
  return (data?.[0] as PdfCoverJob | undefined) ?? null;
}

async function currentSource(db: Database, job: PdfCoverJob, signal: AbortSignal): Promise<PdfCoverSource | null> {
  const { data, error } = await db.from("documents").select(pdfCoverSourceColumns)
    .eq("id", job.document_id).eq("user_id", job.user_id)
    .eq("storage_provider", "cloudflare_r2").eq("storage_bucket", r2BucketName()).eq("storage_state", "available")
    .is("archived_at", null).abortSignal(signal).maybeSingle();
  signal.throwIfAborted();
  if (error) throw new Error("pdf_cover_source_unavailable");
  if (!data || !pdfCoverMatchesSource(job, data, job.user_id) || !supportsPdfPreview(data.mime_type, data.original_filename) ||
    !data.storage_path.startsWith(`${job.user_id}/files/${job.document_id}/`)) return null;
  return data;
}

/** Bound allocations and always cancel R2 on abort, truncation, or overflow. */
export async function readPdfCoverSource(body: ReadableStream<Uint8Array>, size: number, expectedChecksum: string | null, signal: AbortSignal) {
  if (!Number.isSafeInteger(size) || size < 8 || size > PDF_COVER_MAX_SOURCE_BYTES) {
    await body.cancel().catch(() => {}); throw new Error("pdf_cover_too_large");
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  const hash = createHash("sha256");
  let received = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      received += value.byteLength;
      if (received > size) throw new Error("pdf_cover_size_mismatch");
      chunks.push(value); hash.update(value);
    }
    if (received !== size) throw new Error("pdf_cover_size_mismatch");
    const sha256 = hash.digest("hex");
    if (expectedChecksum && sha256 !== expectedChecksum) throw new Error("pdf_cover_checksum_mismatch");
    return { bytes: Buffer.concat(chunks), sha256 };
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }
}

/** A single durable, owner-serialized lease. Never called during list rendering. */
export async function processPdfCoverQueue(db: Database, userId: string, documentId?: string) {
  if (!pdfCoversEnabled() || !isR2Configured()) return { status: "disabled" as const };
  const { data, error } = await db.rpc("claim_pdf_cover", {
    p_user_id: userId, p_renderer_version: PDF_COVER_RENDERER_VERSION, p_document_id: documentId ?? null,
  }).abortSignal(AbortSignal.timeout(PDF_COVER_DATABASE_TIMEOUT_MS));
  if (error) throw new Error("pdf_cover_queue_unavailable");
  const job = data?.[0] as PdfCoverJob | undefined;
  if (!job) return { status: "idle" as const };
  const identity = { p_user_id: userId, p_document_id: job.document_id, p_lease_token: job.lease_token };
  const leaseEnds = Date.parse(job.lease_expires_at ?? "");
  const remaining = leaseEnds - Date.now() - 5_000;
  const signal = AbortSignal.timeout(Math.max(1, Math.min(PDF_COVER_JOB_TIMEOUT_MS, Number.isFinite(remaining) ? remaining : 1)));
  const assertLease = () => {
    signal.throwIfAborted();
    if (!Number.isFinite(leaseEnds) || Date.now() >= leaseEnds - 5_000) throw new Error("pdf_cover_lease_expired");
  };
  try {
    assertLease();
    if (job.user_id !== userId || !job.lease_token || !await currentSource(db, job, signal)) throw new Error("pdf_cover_source_unavailable");
    assertLease();
    const original = await readR2ObjectStream(job.source_path, signal);
    if (original.size !== Number(job.source_size)) {
      await original.body.cancel().catch(() => {}); throw new Error("pdf_cover_size_mismatch");
    }
    const source = await readPdfCoverSource(original.body, Number(job.source_size), job.source_checksum, signal);
    assertLease();
    const output = await renderPdfCover(source.bytes, signal);
    signal.throwIfAborted();
    if (output.bytes.byteLength < 1 || output.bytes.byteLength > PDF_COVER_MAX_OUTPUT_BYTES ||
      !Number.isSafeInteger(output.width) || !Number.isSafeInteger(output.height) ||
      output.width < 1 || output.height < 1 || output.width > PDF_COVER_MAX_EDGE || output.height > PDF_COVER_MAX_EDGE)
      throw new Error("pdf_cover_invalid_output");
    if (!await currentSource(db, job, signal)) throw new Error("pdf_cover_source_unavailable");
    assertLease();
    const key = pdfCoverKey(userId, job.document_id, source.sha256);
    const digest = createHash("sha256").update(output.bytes).digest("hex");
    await createImmutableR2PdfCover(key, output.bytes, signal);
    const verified = await readR2PdfCover(key, signal);
    if (!verified || verified.byteLength !== output.bytes.byteLength || createHash("sha256").update(verified).digest("hex") !== digest)
      throw new Error("pdf_cover_invalid_output");
    assertLease();
    const finished = await db.rpc("finish_pdf_cover", {
      ...identity, p_success: true, p_source_sha256: source.sha256, p_output_sha256: digest,
      p_output_size: output.bytes.byteLength, p_width: output.width, p_height: output.height,
    }).abortSignal(signal);
    if (finished.error) throw new Error("pdf_cover_save_unavailable");
    return { status: finished.data ? "ready" as const : "stale" as const };
  } catch (error) {
    const failure = pdfCoverFailure(error);
    // An interrupted process leaves a lease; the next runner recovers it after expiry.
    const finished = await db.rpc("finish_pdf_cover", {
      ...identity, p_success: false, p_error_code: failure.code, p_retryable: failure.retryable,
    }).abortSignal(AbortSignal.timeout(5_000));
    if (finished.error) throw new Error("pdf_cover_save_unavailable");
    return { status: "failed" as const };
  }
}

/** No original bytes or renderer on the ready path. Verify immutable bytes before serving. */
export async function readReadyPdfCover(job: PdfCoverJob, userId: string, signal?: AbortSignal) {
  if (job.user_id !== userId || job.status !== "ready" || !job.source_sha256 || !job.output_sha256 ||
    job.renderer_version !== PDF_COVER_RENDERER_VERSION ||
    job.storage_path !== pdfCoverKey(userId, job.document_id, job.source_sha256)) throw new Error("pdf_cover_invalid_output");
  let bytes: Buffer | null;
  try { bytes = await readR2PdfCover(job.storage_path, signal); }
  catch (error) {
    if (error instanceof Error && error.message === "pdf_cover_invalid_output") throw new PdfCoverArtifactError("corrupt");
    throw error;
  }
  if (!bytes) throw new PdfCoverArtifactError("missing");
  if (bytes.byteLength !== job.output_size || createHash("sha256").update(bytes).digest("hex") !== job.output_sha256)
    throw new PdfCoverArtifactError("corrupt");
  return bytes;
}

/** Upload success is independent from all queue I/O, including a stalled enqueue. */
export function scheduleUploadedPdfCover(userId: string, documentId: string) {
  if (!pdfCoversEnabled() || !isR2Configured()) return;
  try {
    after(async () => {
      try {
        const db = createAdminClient();
        const job = await enqueuePdfCover(db, userId, documentId, 5);
        if (job && job.status !== "ready") await processPdfCoverQueue(db, userId, documentId);
      } catch { /* Bounded cron discovery and visible requests recover a missed kick. */ }
    });
  } catch { /* A closed request context must never turn a saved upload into failure. */ }
}

export async function backfillPdfCovers(db: Database, userId: string, limit = 3) {
  if (!pdfCoversEnabled() || !isR2Configured()) return 0;
  const result = await db.rpc("backfill_pdf_covers", {
    p_user_id: userId, p_renderer_version: PDF_COVER_RENDERER_VERSION, p_bucket: r2BucketName(), p_limit: Math.min(10, Math.max(0, limit)),
  }).abortSignal(AbortSignal.timeout(PDF_COVER_DATABASE_TIMEOUT_MS));
  if (result.error) throw new Error("pdf_cover_queue_unavailable");
  return Number(result.data ?? 0);
}

export class PdfCoverArtifactError extends Error {
  constructor(public readonly reason: "missing" | "corrupt") { super(`pdf_cover_artifact_${reason}`); }
}

/** CAS repair preserves attempt count; corrupt immutable keys require a new version. */
export async function invalidatePdfCoverArtifact(db: Database, job: PdfCoverJob, reason: "missing" | "corrupt") {
  const result = await db.rpc("invalidate_pdf_cover_artifact", {
    p_user_id: job.user_id, p_document_id: job.document_id, p_renderer_version: job.renderer_version,
    p_source_sha256: job.source_sha256, p_output_sha256: job.output_sha256, p_retryable: reason === "missing",
  }).abortSignal(AbortSignal.timeout(PDF_COVER_DATABASE_TIMEOUT_MS));
  if (result.error) throw new Error("pdf_cover_queue_unavailable");
  return result.data === true;
}
