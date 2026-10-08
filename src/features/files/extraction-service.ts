import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  extractPrivateDocument,
  initialExtractionStatus,
  safeExtractionError,
} from "./text-extraction";
import { recordStatusSafely } from "@/features/system-status/service";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function extractDocumentForOwner(input: {
  supabase: Supabase;
  userId: string;
  documentId: string;
}) {
  const { data: document, error } = await input.supabase
    .from("documents")
    .select("id,storage_path,storage_provider,storage_state,original_filename,mime_type,file_size,checksum,storage_bucket,text_extraction_status,extracted_character_count,updated_at")
    .eq("id", input.documentId)
    .eq("user_id", input.userId)
    .eq("storage_provider", "cloudflare_r2")
    .eq("storage_state", "available")
    .is("archived_at", null)
    .maybeSingle();
  if (error || !document) throw new Error("document_unavailable");

  // Completed OCR/text results must not be erased by an ordinary extraction retry.
  if (document.text_extraction_status === "completed") return { status: "completed", characterCount: document.extracted_character_count } as const;

  const initial = initialExtractionStatus(
    document.original_filename,
    document.mime_type,
    Number(document.file_size),
  );
  if (initial === "unsupported" || initial === "too_large") {
    await input.supabase.from("documents").update({
      text_extraction_status: initial,
      text_extraction_error_code: initial === "too_large" ? "file_too_large" : "unsupported_file_type",
      extracted_text: null,
      extracted_character_count: 0,
    }).eq("id", document.id).eq("user_id", input.userId).eq("storage_path", document.storage_path).eq("file_size", document.file_size).eq("updated_at", document.updated_at);
    await recordStatusSafely(input.userId, "files", { state: "fresh", lastSuccessAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString(), nextStep: "文件已保存；此类型无需文本解析。" }, { type: "succeeded", operationKey: `file-extract-${document.id}-${initial}` });
    return { status: initial, characterCount: 0 } as const;
  }

  const processingIsFresh =
    document.text_extraction_status === "processing" &&
    new Date(document.updated_at).getTime() > Date.now() - 15 * 60_000;
  if (processingIsFresh)
    return { status: "processing", characterCount: 0 } as const;

  const claimableStatuses = ["not_requested", "pending", "failed"];
  if (document.text_extraction_status === "processing")
    claimableStatuses.push("processing");

  const claimed = await input.supabase.from("documents").update({
    text_extraction_status: "processing",
    text_extraction_error_code: null,
  }).eq("id", document.id).eq("user_id", input.userId).eq("updated_at", document.updated_at).in("text_extraction_status", claimableStatuses).select("id,updated_at").maybeSingle();
  if (claimed.error || !claimed.data) throw new Error("extraction_claim_failed");

  const latestResult = async () => {
    const current = await input.supabase.from("documents").select("text_extraction_status,extracted_character_count")
      .eq("id", document.id).eq("user_id", input.userId).eq("storage_state", "available").is("archived_at", null).maybeSingle();
    if (current.error || !current.data) throw new Error("document_unavailable");
    return { status: current.data.text_extraction_status as import("./text-extraction").TextExtractionStatus, characterCount: Number(current.data.extracted_character_count) };
  };

  try {
    const result = await extractPrivateDocument({
      storagePath: document.storage_path,
      filename: document.original_filename,
      mimeType: document.mime_type,
      fileSize: Number(document.file_size),
      userId: input.userId,
    });
    const now = new Date().toISOString();
    const updated = await input.supabase.from("documents").update({
      text_extraction_status: "completed",
      text_extraction_error_code: null,
      extracted_text: result.text,
      extracted_character_count: result.characterCount,
      text_extracted_at: now,
      text_extraction_method: "native", text_extraction_engine_version: null, text_extraction_model_version: null,
      text_extraction_source_sha256: typeof document.checksum === "string" && /^[a-f0-9]{64}$/.test(document.checksum) ? document.checksum : null,
      text_extraction_page_count: null, text_extraction_empty_pages: null,
    }).eq("id", document.id).eq("user_id", input.userId).eq("storage_path", document.storage_path).eq("file_size", document.file_size).eq("text_extraction_status", "processing").eq("updated_at", claimed.data.updated_at).select("id").maybeSingle();
    if (updated.error) throw new Error("extraction_save_failed");
    if (!updated.data) return latestResult();
    await input.supabase.from("audit_logs").insert({
      user_id: input.userId,
      action: "file_text_extracted",
      entity_type: "document",
      entity_id: document.id,
      actor_type: "system",
      after_data: { character_count: result.characterCount },
    });
    await recordStatusSafely(input.userId, "files", { state: "fresh", lastSuccessAt: now, lastAttemptAt: now, nextStep: "文件对象和全文索引均可用。" }, { type: "succeeded", operationKey: `file-extract-${document.id}-${now}` });
    return { status: "completed", characterCount: result.characterCount } as const;
  } catch (extractionError) {
    const code = safeExtractionError(extractionError);
    const failed = await input.supabase.from("documents").update({
      text_extraction_status: code === "file_too_large" || code === "r2_object_too_large" ? "too_large" : "failed",
      text_extraction_error_code: code,
      extracted_text: null,
      extracted_character_count: 0,
      text_extracted_at: null,
    }).eq("id", document.id).eq("user_id", input.userId).eq("storage_path", document.storage_path).eq("file_size", document.file_size).eq("text_extraction_status", "processing").eq("updated_at", claimed.data.updated_at).select("id").maybeSingle();
    if (!failed.error && !failed.data) return latestResult();
    const attemptedAt = new Date().toISOString();
    await recordStatusSafely(input.userId, "files", { state: "failed", lastAttemptAt: attemptedAt, errorCode: code, errorSummary: code, retryAfter: new Date(Date.now() + 30_000).toISOString(), nextStep: "在 Files 页面重新解析，或检查文件对象是否仍可访问。" }, { type: "retry_scheduled", operationKey: `file-extract-${document.id}`, errorCode: code, errorSummary: code, retryAfter: new Date(Date.now() + 30_000).toISOString() });
    return { status: code === "file_too_large" || code === "r2_object_too_large" ? "too_large" : "failed", characterCount: 0, errorCode: code } as const;
  }
}
