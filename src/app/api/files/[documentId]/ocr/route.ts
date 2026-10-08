import { readSource } from "@/features/files/ocr-source";
import { createHash } from "node:crypto";
import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { r2BucketName, readR2ObjectStream } from "@/lib/adapters/cloudflare-r2";
import { OCR_MAX_BYTES, OCR_MAX_CHARACTERS, OCR_MAX_PAGES, ocrErrorMessage, ocrKind, ocrText } from "@/features/files/ocr-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ documentId: string }> };
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Vary": "Cookie" };
const uuid = z.string().uuid();
const input = z.object({ token: uuid, action: z.enum(["progress", "complete", "cancel", "fail"]),
  pages: z.number().int().min(0).max(OCR_MAX_PAGES).default(0), total: z.number().int().min(1).max(OCR_MAX_PAGES).optional(),
  emptyPages: z.number().int().min(0).max(OCR_MAX_PAGES).default(0),
  text: z.string().max(OCR_MAX_CHARACTERS).optional(), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), error: z.string().max(80).optional(),
}).strict();
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "ocr_failed";
  const code = ["ocr_busy", "ocr_source_changed", "ocr_too_large", "ocr_invalid_image"].find(value => message.includes(value)) ?? "ocr_failed";
  return apiAuthenticationFailure(error) ?? reply({ error: ocrErrorMessage(code), code }, code === "ocr_busy" || code === "ocr_source_changed" ? 409 : 422);
}
async function context(params: Context["params"]) {
  const { supabase, userId } = await requireOwnerApi();
  const { documentId } = await params;
  if (!uuid.safeParse(documentId).success) throw new Error("ocr_source_changed");
  const { data: file, error } = await supabase.from("documents")
    .select("id,user_id,storage_path,storage_bucket,checksum,file_size,mime_type,original_filename,text_extraction_method,text_extraction_engine_version,text_extraction_model_version,text_extraction_source_sha256,text_extraction_page_count,text_extraction_empty_pages")
    .eq("id", documentId).eq("user_id", userId).eq("storage_provider", "cloudflare_r2")
    .eq("storage_bucket", r2BucketName()).eq("storage_state", "available").is("archived_at", null).maybeSingle();
  if (error || !file || !file.storage_path.startsWith(`${userId}/files/${documentId}/`)) throw new Error("ocr_source_changed");
  if (!ocrKind(file.original_filename, file.mime_type)) throw new Error("ocr_invalid_image");
  if (!Number.isSafeInteger(file.file_size) || file.file_size < 1 || file.file_size > OCR_MAX_BYTES) throw new Error("ocr_too_large");
  return { supabase, userId, documentId, file };
}
export async function POST(request: Request, { params }: Context) {
  try {
    if (!sameOrigin(request)) return reply({ error: "请求来源无效。" }, 403);
    const { supabase, documentId } = await context(params);
    const result = await supabase.rpc("start_document_ocr", { p_document_id: documentId });
    if (result.error) throw new Error(result.error.message);
    const job = result.data?.[0];
    if (!job) throw new Error("ocr_failed");
    return reply({ token: job.run_token });
  } catch (error) { return failure(error); }
}
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
export async function GET(request: Request, { params }: Context) {
  try {
    const { supabase, userId, documentId, file } = await context(params);
    const result = await supabase.from("document_ocr_jobs").select("*").eq("document_id", documentId).eq("user_id", userId).maybeSingle();
    if (result.error) throw new Error("ocr_failed");
    const job = result.data;
    if (new URL(request.url).searchParams.get("source") !== "1") {
      return reply({ provenance: file.text_extraction_method ? { method: file.text_extraction_method, engine: file.text_extraction_engine_version, models: file.text_extraction_model_version, sourceSha256: file.text_extraction_source_sha256, pages: file.text_extraction_page_count, emptyPages: file.text_extraction_empty_pages } : null, job: job ? { status: job.status === "processing" && Date.parse(job.lease_expires_at) <= Date.now() ? "interrupted" : job.status,
        pages: job.pages_completed, total: job.page_count, emptyPages: job.empty_pages, error: job.error_code } : null });
    }
    if (!job || job.status !== "processing" || job.run_token !== request.headers.get("X-Ocr-Run") || Date.parse(job.lease_expires_at) <= Date.now() ||
      job.source_path !== file.storage_path || job.source_bucket !== file.storage_bucket || job.source_size !== file.file_size || job.source_checksum !== file.checksum)
      throw new Error("ocr_source_changed");
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]);
    const source = await readR2ObjectStream(file.storage_path, signal);
    if (source.size !== file.file_size) { await source.body.cancel(); throw new Error("ocr_source_changed"); }
    const bytes = await readSource(source.body, file.file_size, signal);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (file.checksum && digest !== file.checksum) throw new Error("ocr_source_changed");
    return new Response(bytes, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length), "X-Ocr-Sha256": digest } });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    if (!sameOrigin(request)) return reply({ error: "请求来源无效。" }, 403);
    const { supabase, documentId } = await context(params);
    const bytes = request.body ? await readSource(request.body, 1_300_000, AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]), false) : new Uint8Array();
    const parsed = input.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!parsed.success) return reply({ error: "OCR 请求无效。" }, 400);
    const data = parsed.data;
    const text = data.text === undefined ? null : ocrText(data.text);
    if (data.action === "complete" && (!text || !data.sha256 || !data.total || data.pages !== data.total || data.emptyPages > data.total)) return reply({ error: "OCR 结果不完整。" }, 400);
    const result = await supabase.rpc("update_document_ocr", { p_document_id: documentId, p_run_token: data.token, p_action: data.action,
      p_pages: data.pages, p_total: data.total ?? null, p_text: text, p_sha256: data.sha256 ?? null, p_error: data.error ?? null, p_empty_pages: data.emptyPages });
    if (result.error) throw new Error("ocr_failed");
    if (!result.data) throw new Error("ocr_source_changed");
    return reply({ ok: true, characterCount: text?.length ?? 0 });
  } catch (error) { return failure(error); }
}
