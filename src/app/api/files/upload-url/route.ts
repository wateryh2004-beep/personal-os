import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { createUploadUrl, isR2Configured, objectExists, r2BucketName } from "@/lib/adapters/cloudflare-r2";
import { canUpload, completeUploadSchema, safeFilename, uploadRequestSchema } from "@/features/files/schemas";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers });

async function audit(supabase: Awaited<ReturnType<typeof requireOwnerApi>>["supabase"], userId: string, action: string, id: string, data: Record<string, unknown>) {
  await supabase.from("audit_logs").insert({ user_id: userId, action, entity_type: "document", entity_id: id, actor_type: "user", after_data: data });
}

export async function POST(request: Request) {
  let owner: Awaited<ReturnType<typeof requireOwnerApi>>;
  try { owner = await requireOwnerApi(); } catch (error) { return apiAuthenticationFailure(error) ?? fail("暂时无法验证身份。", 500); }
  if (!isR2Configured()) return fail("Files 尚未完成云端存储配置。", 503);
  let raw: unknown;
  try { raw = await request.json(); } catch { return fail("请求格式无效。"); }
  const parsed = uploadRequestSchema.safeParse(raw);
  if (!parsed.success || !canUpload(parsed.data?.filename ?? "", parsed.data?.contentType ?? "", parsed.data?.size ?? 0)) return fail("文件类型或大小不受支持。");
  const { supabase, userId } = owner;
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
  });
  if (error) return fail("文件记录未能创建。", 500);
  try {
    const uploadUrl = await createUploadUrl(key, parsed.data.contentType);
    await audit(supabase, userId, "upload_requested", documentId, { filename, size: parsed.data.size, folder_id: parsed.data.folderId ?? null });
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
  const { data: document } = await supabase.from("documents").select("id,storage_path,file_size,mime_type").eq("id", parsed.data.documentId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "pending").maybeSingle();
  if (!document) return fail("上传记录不存在。", 404);
  const object = await objectExists(document.storage_path);
  if (!object.exists || object.size !== Number(document.file_size)) return fail("文件尚未完整上传，请重试。", 409);
  const { error } = await supabase.from("documents").update({ storage_state: "available", uploaded_at: new Date().toISOString() }).eq("id", document.id);
  if (error) return fail("文件未能确认。", 500);
  await audit(supabase, userId, "upload_completed", document.id, { size: document.file_size, content_type: document.mime_type });
  return NextResponse.json({ ok: true }, { headers });
}
