import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { isR2Configured, r2BucketName, readR2ObjectSlice } from "@/lib/adapters/cloudflare-r2";
import {
  checkPdfObject, checkPdfPreviewSize, parsePdfRange, pdfContentRange, pdfInlineDisposition,
  PdfPreviewError, pdfPreviewHeaders, pdfPreviewTimeoutMs, pdfSignatureBytes, streamPdfBytes, supportsPdfPreview, validatePdfSignature,
} from "@/features/files/pdf-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Context = { params: Promise<{ documentId: string }> };

function unavailable(status: number, head: boolean, headers: Record<string, string> = {}) {
  return new Response(head ? null : JSON.stringify({ error: "PDF 预览暂时不可用，可下载原文件查看。" }), {
    status, headers: { ...pdfPreviewHeaders, "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

async function preview(request: Request, { params }: Context, head: boolean) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const { documentId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) return unavailable(404, head);
    if (!isR2Configured()) return unavailable(503, head);
    const { data: file, error } = await supabase.from("documents")
      .select("storage_path,mime_type,file_size,original_filename")
      .eq("id", documentId).eq("user_id", userId)
      .eq("storage_provider", "cloudflare_r2").eq("storage_bucket", r2BucketName()).eq("storage_state", "available")
      .is("archived_at", null).maybeSingle();
    if (error || !file || typeof file.storage_path !== "string" || !file.storage_path.startsWith(`${userId}/files/${documentId}/`))
      return unavailable(404, head);
    if (!supportsPdfPreview(file.mime_type ?? "", file.original_filename ?? "")) return unavailable(415, head);
    const total = Number(file.file_size);
    checkPdfPreviewSize(total);
    let range;
    try { range = parsePdfRange(head ? null : request.headers.get("range"), total); }
    catch (error) {
      if (!(error instanceof PdfPreviewError) || error.code !== "range") throw error;
      return unavailable(416, head, { "Content-Range": `bytes */${total}`, "Accept-Ranges": "bytes" });
    }

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(pdfPreviewTimeoutMs)]);
    signal.throwIfAborted();
    const prefixRange = { start: 0, end: pdfSignatureBytes - 1 };
    const prefix = await readR2ObjectSlice(file.storage_path, { range: prefixRange, signal });
    const etag = await checkPdfObject(prefix, total, prefixRange);
    await validatePdfSignature(prefix.body, signal);
    // Only a matching strong ETag authorizes serving a partial current version.
    // Unsupported date validators and stale/weak ETags get the full response.
    if (range && request.headers.has("if-range") && request.headers.get("if-range") !== etag) range = null;
    const headers = {
      ...pdfPreviewHeaders, "Content-Type": "application/pdf", "Accept-Ranges": "bytes", ETag: etag,
      "Content-Length": String(range ? range.end - range.start + 1 : total),
      "Content-Disposition": pdfInlineDisposition(file.original_filename ?? "document.pdf"),
      ...(range ? { "Content-Range": pdfContentRange(range, total) } : {}),
    };
    if (head) return new Response(null, { headers });
    signal.throwIfAborted();
    const object = await readR2ObjectSlice(file.storage_path, { ...(range ? { range } : {}), ifMatch: etag, signal });
    await checkPdfObject(object, total, range, etag);
    return new Response(streamPdfBytes(object.body, object.size, signal), { status: range ? 206 : 200, headers });
  } catch (error) {
    const authenticationFailure = apiAuthenticationFailure(error);
    if (authenticationFailure) {
      for (const [key, value] of Object.entries(pdfPreviewHeaders)) authenticationFailure.headers.set(key, value);
      return head ? new Response(null, { status: authenticationFailure.status, headers: authenticationFailure.headers }) : authenticationFailure;
    }
    if (error instanceof PdfPreviewError)
      return unavailable(error.code === "too_large" ? 413 : error.code === "unavailable" ? 503 : 422, head);
    return unavailable(503, head);
  }
}

export async function GET(request: Request, context: Context) { return preview(request, context, false); }
export async function HEAD(request: Request, context: Context) { return preview(request, context, true); }
