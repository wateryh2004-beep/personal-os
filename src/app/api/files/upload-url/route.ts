import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { createUploadUrl, deleteR2Object, isR2Configured, objectExists, r2BucketName } from "@/lib/adapters/cloudflare-r2";
import { canUpload, canUploadNoteImage, completeUploadSchema, fileIdSchema, safeFilename, uploadRequestSchema } from "@/features/files/schemas";
import { canAbortPendingUpload, stalePendingCutoff } from "@/features/files/upload-state";
import { initialExtractionStatus } from "@/features/files/text-extraction";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers });

async function audit(supabase: Awaited<ReturnType<typeof requireOwnerApi>>["supabase"], userId: string, action: string, id: string, data: Record<string, unknown>) {
  await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: "document", entity_id: id, actor_type: "user", after_data: data });
}

async function cleanStalePendingUploads(supabase: Awaited<ReturnType<typeof requireOwnerApi>>["supabase"], userId: string) {
  const cutoff = stalePendingCutoff();
  const { data } = await supabase.from("documents").select("id,storage_path").eq("user_id", userId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "pending").lt("created_at", cutoff);
  for (const document of data ?? []) {
    await supabase.from("documents").delete().eq("id", document.id).eq("storage_provider", "cloudflare_r2").eq("storage_state", "pending");
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
  const documentId = randomUUID();
  const filename = safeFilename(parsed.data.filename);
  const key = `${userId}/files/${documentId}/${filename}`;
  const { error } = await supabase.from("documents").insert({
    id: documentId, user_id: userId, title: filename, document_type: "other", original_filename: filename,
    storage_bucket: r2BucketName(), storage_path: key, storage_provider: "cloudflare_r2", storage_state: "pending",
    mime_type: parsed.data.contentType, file_size: parsed.data.size, folder_id: parsed.data.folderId ?? null,
    text_extraction_status: initialExtractionStatus(filename, parsed.data.contentType, parsed.data.size),
  });
  if (error) return fail("文件记录未能创建。", 500);
  try {
    const uploadUrl = await createUploadUrl(key, parsed.data.contentType);
    await audit(supabase, userId, "upload_requested", documentId, { filename, size: parsed.data.size, folder_id: parsed.data.folderId ?? null, note_id: parsed.data.noteId ?? null });
    return NextResponse.json({ documentId, uploadUrl }, { headers });
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
  const { data: document } = await supabase.from("documents").select("id,storage_path,file_size,mime_type,original_filename,text_extraction_status").eq("id", parsed.data.documentId).eq("user_id", userId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "pending").maybeSingle();
  if (!document) return fail("上传记录不存在。", 404);
  const object = await objectExists(document.storage_path);
  if (!object.exists || object.size !== Number(document.file_size)) return fail("文件尚未完整上传，请重试。", 409);
  if (parsed.data.noteId) {
    const { data: note } = await supabase.from("notes").select("id").eq("id", parsed.data.noteId).is("deleted_at", null).maybeSingle();
    if (!note) return fail("目标笔记不存在或无权访问。", 404);
    const { error: linkError } = await supabase.from("entity_links").upsert({ user_id: userId, source_type: "note", source_id: note.id, target_type: "document", target_id: document.id, relationship_type: "attachment" }, { onConflict: "user_id,source_type,source_id,target_type,target_id,relationship_type" });
    if (linkError) return fail("图片已上传，但未能关联到笔记。", 500);
  }
  const { error } = await supabase.from("documents").update({ storage_state: "available", uploaded_at: new Date().toISOString() }).eq("id", document.id);
  if (error) return fail("文件未能确认。", 500);
  await audit(supabase, userId, "upload_completed", document.id, { size: document.file_size, content_type: document.mime_type, note_id: parsed.data.noteId ?? null });
  return NextResponse.json({ ok: true, extractionStatus: document.text_extraction_status }, { headers });
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
  const { error } = await supabase.from("documents").delete().eq("id", document.id).eq("storage_provider", "cloudflare_r2").eq("storage_state", "pending");
  if (error) return fail("未能清理上传记录。", 500);
  try { await deleteR2Object(document.storage_path); } catch { /* Object cleanup is best-effort and deliberately opaque. */ }
  await audit(supabase, userId, "upload_aborted", document.id, {});
  return NextResponse.json({ ok: true }, { headers });
}
