import { randomUUID } from "crypto";
import { scheduleUploadedPdfCover } from "@/features/files/pdf-cover-service";
import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { createUploadUrl, deleteR2Object, isR2Configured, readR2ObjectStream, copyVerifiedR2Object, r2BucketName } from "@/lib/adapters/cloudflare-r2";
import { canUpload, canUploadNoteImage, completeUploadSchema, fileIdSchema, safeFilename, uploadRequestSchema } from "@/features/files/schemas";
import { canAbortPendingUpload, stalePendingCutoff } from "@/features/files/upload-state";
import { verifyFileStream } from "@/features/files/integrity";
import { initialExtractionStatus } from "@/features/files/text-extraction";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers });

async function audit(supabase: Awaited<ReturnType<typeof requireOwnerApi>>["supabase"], userId: string, action: string, id: string, data: Record<string, unknown>) {
  try {
    const { error } = await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: "document", entity_id: id, actor_type: "user", after_data: data });
    return !error;
  } catch { return false; }
}

async function cleanStalePendingUploads(supabase: Awaited<ReturnType<typeof requireOwnerApi>>["supabase"], userId: string) {
  const cutoff = stalePendingCutoff();
  const { data } = await supabase.from("documents").select("id,storage_path").eq("user_id", userId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "pending").lt("created_at", cutoff);
  for (const document of data ?? []) {
    const removed = await supabase.from("documents").delete().eq("id", document.id).eq("user_id", userId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "pending").select("id");
    if (removed.error || !removed.data?.length) continue;
    try { await deleteR2Object(document.storage_path); } catch { /* A private orphan is safer than surfacing R2 details; retry on later cleanup. */ }
  }
}

export async function POST(request: Request) {
  let owner: Awaited<ReturnType<typeof requireOwnerApi>>;
  try { owner = await requireOwnerApi(); } catch (error) { return apiAuthenticationFailure(error) ?? fail("暂时无法验证身份。", 500); }
  if (!isR2Configured()) return fail("Files 尚未完成云端存储配置。", 503);
  let raw: unknown;
  try { raw = await request.json(); } catch { return fail("请求格式无效。"); }
  const parsed = uploadRequestSchema.safeParse(raw);
  if (!parsed.success || !(parsed.data.noteId ? canUploadNoteImage(parsed.data.filename, parsed.data.contentType, parsed.data.size) : canUpload(parsed.data.filename, parsed.data.contentType, parsed.data.size))) return fail(parsed.data?.noteId ? "仅支持 PNG、JPG、WebP、GIF 或 AVIF 图片，且单张不超过 15MB。" : "文件类型或大小不受支持。");
  const { supabase, userId } = owner;
  await cleanStalePendingUploads(supabase, userId);
  if (parsed.data.noteId) {
    const { data: note } = await supabase.from("notes").select("id").eq("id", parsed.data.noteId).is("deleted_at", null).maybeSingle();
    if (!note) return fail("目标笔记不存在或无权访问。", 404);
  }
  if (parsed.data.folderId) {
    const { data } = await supabase.from("file_folders").select("id").eq("id", parsed.data.folderId).is("archived_at", null).maybeSingle();
    if (!data) return fail("目标文件夹不存在或无权访问。", 404);
  }
  // Resume only this owner's matching pending object; attachment IDs stay stable.
  if (parsed.data.checksum && !parsed.data.noteId) {
    let pendingQuery = supabase.from("documents")
      .select("id,title,original_filename,mime_type,file_size,folder_id,storage_path,text_extraction_status")
      .eq("user_id", userId).eq("checksum", parsed.data.checksum)
      .eq("mime_type", parsed.data.contentType).eq("file_size", parsed.data.size)
      .eq("storage_provider", "cloudflare_r2").eq("storage_bucket", r2BucketName())
      .eq("storage_state", "pending").is("archived_at", null);
    pendingQuery = parsed.data.folderId ? pendingQuery.eq("folder_id", parsed.data.folderId) : pendingQuery.is("folder_id", null);
    const { data: pending, error: lookupError } = await pendingQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lookupError) return fail("暂时无法检查未完成的上传，请稍后重试。", 500);
    if (pending) {
      try {
        return NextResponse.json({ documentId: pending.id, resumed: true,
          uploadUrl: await createUploadUrl(pending.storage_path, pending.mime_type),
          file: { id: pending.id, title: pending.title, originalFilename: pending.original_filename,
            mimeType: pending.mime_type, fileSize: pending.file_size, folderId: pending.folder_id,
            textExtractionStatus: pending.text_extraction_status },
        }, { headers });
      } catch { return fail("暂时无法续传，请稍后重试。", 500); }
    }
  }
  const documentId = randomUUID();
  const filename = safeFilename(parsed.data.filename);
  const key = `${userId}/files/${documentId}/${filename}`;
  const { error } = await supabase.from("documents").insert({
    id: documentId, user_id: userId, title: filename, document_type: "other", original_filename: filename,
    storage_bucket: r2BucketName(), storage_path: key, storage_provider: "cloudflare_r2", storage_state: "pending",
    mime_type: parsed.data.contentType, file_size: parsed.data.size, folder_id: parsed.data.folderId ?? null,
    checksum: parsed.data.checksum ?? null,
    text_extraction_status: initialExtractionStatus(filename, parsed.data.contentType, parsed.data.size),
  });
  if (error) return fail("文件记录未能创建。", 500);
  try {
    const uploadUrl = await createUploadUrl(key, parsed.data.contentType);
    await audit(supabase, userId, "upload_requested", documentId, { filename, size: parsed.data.size, folder_id: parsed.data.folderId ?? null, note_id: parsed.data.noteId ?? null });
    return NextResponse.json({
      documentId,
      uploadUrl,
      // The browser keeps this small, non-sensitive record locally after the
      // upload succeeds. It avoids a full RSC refresh merely to show a file
      // the user has just uploaded.
      file: {
        id: documentId,
        title: filename,
        originalFilename: filename,
        mimeType: parsed.data.contentType,
        fileSize: parsed.data.size,
        folderId: parsed.data.folderId ?? null,
        textExtractionStatus: initialExtractionStatus(
          filename,
          parsed.data.contentType,
          parsed.data.size,
        ),
      },
    }, { headers });
  } catch {
    await supabase.from("documents").delete().eq("id", documentId);
    return fail("上传准备失败，请检查 R2 配置。", 503);
  }
}

export async function PATCH(request: Request) {
  let owner: Awaited<ReturnType<typeof requireOwnerApi>>;
  try { owner = await requireOwnerApi(); } catch (error) { return apiAuthenticationFailure(error) ?? fail("暂时无法验证身份。", 500); }
  let raw: unknown;
  try { raw = await request.json(); } catch { return fail("请求格式无效。"); }
  const parsed = completeUploadSchema.safeParse(raw); if (!parsed.success) return fail("文件标识无效。");
  const { supabase, userId } = owner;
  const select = "id,storage_path,file_size,mime_type,original_filename,text_extraction_status,checksum,storage_state,archived_at";
  const readDocument = () => supabase.from("documents").select(select).eq("id", parsed.data.documentId).eq("user_id", userId).eq("storage_provider", "cloudflare_r2").maybeSingle();
  const { data: document, error: readError } = await readDocument();
  if (readError) return fail("暂时无法确认上传状态，请稍后重试。", 503);
  if (!document) return fail("上传记录不存在。", 404);
  if (document.archived_at || document.storage_state === "archived") return fail("文件已归档，请在归档区恢复。", 409);
  // Completion is idempotent after a lost response, but never unarchives a file.
  if (document.storage_state === "available") {
    if (parsed.data.noteId) {
      const link = await supabase.from("entity_links").select("id").eq("source_type", "note").eq("source_id", parsed.data.noteId).eq("target_type", "document").eq("target_id", document.id).eq("relationship_type", "attachment").eq("user_id", userId).is("archived_at", null).maybeSingle();
      if (link.error || !link.data) return fail("文件已保存，但此笔记关联未确认。", 409);
    }
    scheduleUploadedPdfCover(userId, document.id);
    return NextResponse.json({ ok: true, alreadyCompleted: true, extractionStatus: document.text_extraction_status }, { headers });
  }
  if (document.storage_state !== "pending" || !document.storage_path.startsWith(`${userId}/files/${document.id}/`)) return fail("上传状态无效。", 409);
  let noteId: string | null = null;
  if (parsed.data.noteId) {
    const { data: note } = await supabase.from("notes").select("id").eq("id", parsed.data.noteId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (!note) return fail("目标笔记不存在或无权访问。", 404);
    noteId = note.id;
  }
  let checksum: string;
  const finalPath = `${userId}/files/${document.id}/sealed-${randomUUID()}/${safeFilename(document.original_filename)}`;
  try {
    const object = await readR2ObjectStream(document.storage_path, request.signal);
    if (object.size !== Number(document.file_size) || !object.etag) {
      await object.body.cancel().catch(() => {});
      return fail("文件尚未完整上传，请重试。", 409);
    }
    const verified = await verifyFileStream(object.body, Number(document.file_size), document.checksum);
    checksum = verified.checksum;
    // A still-live PUT URL only targets staging. Conditional copy binds the
    // final bytes to the exact ETag hashed above; provider failure is fail-closed.
    await copyVerifiedR2Object(document.storage_path, finalPath, object.etag);
    // ETag is a concurrency token, not a cryptographic integrity proof. Verify
    // the sealed bytes themselves before making their metadata available.
    const sealed = await readR2ObjectStream(finalPath, request.signal);
    if (sealed.size !== Number(document.file_size)) {
      await sealed.body.cancel().catch(() => {});
      throw new Error("file_size_mismatch");
    }
    await verifyFileStream(sealed.body, Number(document.file_size), checksum);
  } catch (error) {
    if (error instanceof Error && ["file_checksum_mismatch", "file_size_mismatch"].includes(error.message)) return fail("文件校验不一致，尚未完成保存，请重新上传。", 409);
    return fail("文件校验暂时未完成，请稍后重试；原上传记录已保留。", 503);
  }
  if (noteId) {
    const { error: linkError } = await supabase.from("entity_links").upsert({ user_id: userId, source_type: "note", source_id: noteId, target_type: "document", target_id: document.id, relationship_type: "attachment" }, { onConflict: "user_id,source_type,source_id,target_type,target_id,relationship_type" });
    if (linkError) return fail("图片已上传，但未能关联到笔记。", 500);
  }
  // Compare-and-set prevents concurrent completion or archival from being
  // overwritten. Unreferenced copies are retained for conservative later cleanup.
  const { data: completed, error } = await supabase.from("documents").update({ storage_state: "available", storage_path: finalPath, checksum, uploaded_at: new Date().toISOString() }).eq("id", document.id).eq("user_id", userId).eq("storage_state", "pending").eq("storage_path", document.storage_path).is("archived_at", null).select("id").maybeSingle();
  if (error) return fail("文件确认结果暂不明确，请重试确认。", 503);
  if (!completed) {
    const current = await readDocument();
    if (current.error || current.data?.storage_state !== "available" || current.data.archived_at) return fail("文件状态已变化，请刷新后检查。", 409);
    scheduleUploadedPdfCover(userId, document.id);
    return NextResponse.json({ ok: true, alreadyCompleted: true, extractionStatus: current.data.text_extraction_status }, { headers });
  }
  // Audit failure must not turn a confirmed stored file into a false upload failure.
  const audited = await audit(supabase, userId, "upload_completed", document.id, { size: document.file_size, content_type: document.mime_type, checksum, note_id: noteId });
  scheduleUploadedPdfCover(userId, document.id);
  return NextResponse.json({ ok: true, extractionStatus: document.text_extraction_status, warning: audited ? undefined : "文件已保存，但操作日志未记录。" }, { headers });
}

/** Best-effort cleanup after a browser-to-R2 failure. Available files are never eligible. */
export async function DELETE(request: Request) {
  let owner: Awaited<ReturnType<typeof requireOwnerApi>>;
  try { owner = await requireOwnerApi(); } catch (error) { return apiAuthenticationFailure(error) ?? fail("暂时无法验证身份。", 500); }
  const parsed = fileIdSchema.safeParse({ documentId: new URL(request.url).searchParams.get("documentId") });
  if (!parsed.success) return fail("文件标识无效。");
  const { supabase, userId } = owner;
  const { data: document } = await supabase.from("documents").select("id,storage_path,storage_provider,storage_state").eq("id", parsed.data.documentId).eq("user_id", userId).maybeSingle();
  if (!document || !canAbortPendingUpload(document)) return fail("只有尚未完成的上传可以取消。", 409);
  const { data: removed, error } = await supabase.from("documents").delete().eq("id", document.id).eq("user_id", userId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "pending").select("id");
  if (error) return fail("未能清理上传记录。", 500);
  if (!removed?.length) return fail("文件状态已变化，未删除文件。", 409);
  try { await deleteR2Object(document.storage_path); } catch { /* Object cleanup is best-effort and deliberately opaque. */ }
  await audit(supabase, userId, "upload_aborted", document.id, {});
  return NextResponse.json({ ok: true }, { headers });
}
