import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createUploadUrl, isR2Configured, objectExists, r2BucketName } from "@/lib/adapters/cloudflare-r2";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { canUploadNoteImage, safeFilename } from "@/features/files/schemas";
import { r2FailureMessage } from "@/features/files/r2-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const serverFallbackLimit = 4 * 1024 * 1024;
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers });

class ImageUploadFailure extends Error {
  constructor(readonly publicMessage: string, readonly status = 502) {
    super(publicMessage);
  }
}

/**
 * Same-origin fallback for clipboard screenshots. It avoids a browser-to-R2
 * CORS preflight while keeping the payload small enough for a Vercel Function.
 */
export async function POST(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  let owner: Awaited<ReturnType<typeof requireOwnerApi>>;
  try { owner = await requireOwnerApi(); } catch (error) { return apiAuthenticationFailure(error) ?? fail("暂时无法验证身份。", 500); }
  if (!isR2Configured()) return fail("Files 尚未完成云端存储配置。", 503);
  const { noteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(noteId)) return fail("笔记标识无效。");
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("图片请求无效。"); }
  const image = form.get("image");
  if (!(image instanceof File)) return fail("未找到图片文件。");
  const filename = safeFilename(image.name || `screenshot-${Date.now()}.png`);
  if (image.size > serverFallbackLimit) return fail("此图片超过安全转发上限，请检查 R2 CORS 后重试。", 413);
  if (!canUploadNoteImage(filename, image.type, image.size)) return fail("仅支持 PNG、JPG、WebP、GIF 或 AVIF 图片，且单张不超过 15MB。");

  const { supabase, userId } = owner;
  const { data: note } = await supabase.from("notes").select("id").eq("id", noteId).is("deleted_at", null).maybeSingle();
  if (!note) return fail("目标笔记不存在或无权访问。", 404);
  const documentId = randomUUID();
  const key = `${userId}/notes/${note.id}/${documentId}/${filename}`;
  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId, user_id: userId, title: filename, document_type: "other", original_filename: filename,
    storage_bucket: r2BucketName(), storage_path: key, storage_provider: "cloudflare_r2", storage_state: "pending",
    mime_type: image.type, file_size: image.size,
  });
  if (insertError) return fail("图片记录未能创建。", 500);

  try {
    const response = await fetch(await createUploadUrl(key, image.type), { method: "PUT", headers: { "Content-Type": image.type }, body: image });
    if (!response.ok) throw new ImageUploadFailure(r2FailureMessage(response.status, "upload"));
    const object = await objectExists(key);
    if (!object.exists || object.size !== image.size) throw new ImageUploadFailure(r2FailureMessage(object.status, "verify"));
    const { error: availableError } = await supabase.from("documents").update({ storage_state: "available", uploaded_at: new Date().toISOString() }).eq("id", documentId);
    if (availableError) throw new ImageUploadFailure("图片已写入 R2，但数据库未能确认记录。请稍后重试。", 500);
    const { error: linkError } = await supabase.from("entity_links").insert({ user_id: userId, source_type: "note", source_id: note.id, target_type: "document", target_id: documentId, relationship_type: "attachment" });
    if (linkError) throw new ImageUploadFailure("图片已写入 R2，但未能关联到当前笔记。请稍后重试。", 500);
    await supabase.from("audit_logs").insert({ user_id: userId, action: "upload", entity_type: "document", entity_id: documentId, actor_type: "user", after_data: { note_id: note.id, size: image.size, content_type: image.type, upload_path: "same_origin_fallback" } });
    return NextResponse.json({ src: `/api/files/${documentId}/download?inline=1` }, { headers });
  } catch (error) {
    await supabase.from("documents").delete().eq("id", documentId);
    if (error instanceof ImageUploadFailure) return fail(error.publicMessage, error.status);
    // Do not log provider errors here: they can include signed request data.
    return fail(r2FailureMessage(null, "upload"), 502);
  }
}
