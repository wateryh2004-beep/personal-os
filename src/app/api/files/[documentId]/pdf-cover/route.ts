import { after } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured, r2BucketName } from "@/lib/adapters/cloudflare-r2";
import { supportsPdfPreview } from "@/features/files/pdf-preview";
import {
  enqueuePdfCover, invalidatePdfCoverArtifact, PdfCoverArtifactError, pdfCoverMatchesSource, pdfCoverSourceColumns, processPdfCoverQueue, readReadyPdfCover, type PdfCoverJob,
} from "@/features/files/pdf-cover-service";
import {
  PDF_COVER_DATABASE_TIMEOUT_MS, PDF_COVER_MAX_SOURCE_BYTES, PDF_COVER_RETRY_SECONDS, pdfCoverEtag, pdfCoverKey, pdfCoverPrivateHeaders, pdfCoversEnabled,
} from "@/features/files/pdf-cover-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const unavailable = (status: number, state = "unavailable") => Response.json({ status: state }, { status, headers: pdfCoverPrivateHeaders });

/** Owner-scoped derived image endpoint. Never fetches or renders a PDF inline. */
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    if (!pdfCoversEnabled()) return unavailable(503, "disabled");
    const { documentId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) return unavailable(404);
    if (!isR2Configured()) return unavailable(503);
    const metadataSignal = AbortSignal.any([request.signal, AbortSignal.timeout(PDF_COVER_DATABASE_TIMEOUT_MS)]);
    const { data: file, error } = await supabase.from("documents").select(pdfCoverSourceColumns)
      .eq("id", documentId).eq("user_id", userId).eq("storage_provider", "cloudflare_r2")
      .eq("storage_bucket", r2BucketName()).eq("storage_state", "available").is("archived_at", null).abortSignal(metadataSignal).maybeSingle();
    if (error || !file || file.user_id !== userId || !file.storage_path?.startsWith(`${userId}/files/${documentId}/`)) return unavailable(404);
    if (!supportsPdfPreview(file.mime_type, file.original_filename)) return unavailable(415);
    if (!Number.isSafeInteger(Number(file.file_size)) || Number(file.file_size) < 8) return unavailable(422, "failed");
    if (Number(file.file_size) > PDF_COVER_MAX_SOURCE_BYTES) return unavailable(413, "failed");
    request.signal.throwIfAborted();
    const cached = await supabase.from("pdf_cover_jobs").select("*")
      .eq("document_id", documentId).eq("user_id", userId).abortSignal(metadataSignal).maybeSingle();
    if (cached.error) return unavailable(503);
    let job = cached.data as PdfCoverJob | null;
    // Successful repeat navigation is read-only: no enqueue, lock, or R2 GET for 304.
    const current = job && pdfCoverMatchesSource(job, file, userId);
    let admin: ReturnType<typeof createAdminClient> | undefined;
    if (!current || (job && job.status !== "ready" && job.next_attempt_at && job.priority < 10)) {
      admin = createAdminClient();
      job = await enqueuePdfCover(admin, userId, documentId, 10, metadataSignal);
    }
    if (!job) return unavailable(404);
    if (pdfCoverMatchesSource(job, file, userId) && job.status === "ready") {
      if (!job.output_sha256 || !job.source_sha256 || job.storage_path !== pdfCoverKey(userId, documentId, job.source_sha256)) return unavailable(503);
      const etag = pdfCoverEtag(job.output_sha256);
      const headers = { ...pdfCoverPrivateHeaders, "Cache-Control": "private, max-age=0, must-revalidate", ETag: etag };
      // Cache validators never bypass authentication, archival, source/version checks.
      if (request.headers.get("if-none-match")?.split(",").some((value) => value.trim().replace(/^W\//, "") === etag))
        return new Response(null, { status: 304, headers });
      let bytes: Uint8Array;
      try { bytes = await readReadyPdfCover(job, userId, request.signal); }
      catch (error) {
        if (!(error instanceof PdfCoverArtifactError)) throw error;
        const repairDb = createAdminClient();
        const invalidated = await invalidatePdfCoverArtifact(repairDb, job, error.reason);
        if (error.reason === "corrupt" || job.attempts >= 3) return unavailable(422, "failed");
        if (invalidated) after(async () => { await processPdfCoverQueue(repairDb, userId, documentId).catch(() => {}); });
        return Response.json({ status: "pending", retryAfter: PDF_COVER_RETRY_SECONDS }, {
          status: 202, headers: { ...pdfCoverPrivateHeaders, "Retry-After": String(PDF_COVER_RETRY_SECONDS) },
        });
      }
      return new Response(new Uint8Array(bytes), { headers: {
        ...headers, "Content-Type": "image/webp", "Content-Length": String(bytes.byteLength), "Content-Disposition": "inline",
      } });
    }
    if (pdfCoverMatchesSource(job, file, userId) && job.status === "failed" && !job.next_attempt_at) return unavailable(422, "failed");
    const workerDb = admin ?? createAdminClient();
    after(async () => { await processPdfCoverQueue(workerDb, userId, documentId).catch(() => {}); });
    return Response.json({ status: job.status === "processing" ? "processing" : "pending", retryAfter: PDF_COVER_RETRY_SECONDS }, {
      status: 202, headers: { ...pdfCoverPrivateHeaders, "Retry-After": String(PDF_COVER_RETRY_SECONDS) },
    });
  } catch (error) {
    const denied = apiAuthenticationFailure(error);
    if (denied) {
      for (const [key, value] of Object.entries(pdfCoverPrivateHeaders)) denied.headers.set(key, value);
      return denied;
    }
    return unavailable(503);
  }
}
