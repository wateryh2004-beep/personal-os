import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createUploadUrl, isR2Configured, r2BucketName } from "@/lib/adapters/cloudflare-r2";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { canUploadNoteImage, safeFilename } from "@/features/files/schemas";
import { experienceUploadRequestSchema } from "@/features/experience-library/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers });

/** Reconcile the same owner-scoped document after an interrupted upload. */
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const documentId = new URL(request.url).searchParams.get("documentId");
    if (!documentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) return fail("图片标识无效。");
    const { data: document, error } = await supabase.from("documents")
      .select("id,storage_path,storage_provider,storage_state,archived_at,mime_type,original_filename,file_size")
      .eq("id", documentId).eq("user_id", userId).is("archived_at", null)
      .is("vault_group_id", null).eq("upload_mode", "single").maybeSingle();
    if (error || !document || document.storage_provider !== "cloudflare_r2"
      || !["pending", "available"].includes(document.storage_state)
      || !document.storage_path.startsWith(`${userId}/files/${documentId}/`)
      || !canUploadNoteImage(document.original_filename, document.mime_type, Number(document.file_size))) {
      return fail("原上传记录不可用，请移除该图片后重新添加。", 404);
    }
    return NextResponse.json({ documentId, state: document.storage_state,
      ...(document.storage_state === "pending" ? { uploadUrl: await createUploadUrl(document.storage_path, document.mime_type) } : {}) }, { headers });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? fail("图片上传状态暂未确认，请重试。", 503);
  }
}

/**
 * Experience images deliberately use their own narrow preparation boundary:
 * only verified browser-safe raster formats are accepted, then the existing
 * Files finalization route performs the full size/hash/seal verification.
 */
export async function POST(request: Request) {
  let owner: Awaited<ReturnType<typeof requireOwnerApi>>;
  try {
    owner = await requireOwnerApi();
  } catch (error) {
    return apiAuthenticationFailure(error) ?? fail("暂时无法验证身份。", 500);
  }
  if (!isR2Configured()) return fail("私有图片存储尚未配置。", 503);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("图片上传请求无效。");
  }
  const parsed = experienceUploadRequestSchema.safeParse(raw);
  if (!parsed.success) return fail("图片上传信息无效。");
  const filename = safeFilename(parsed.data.filename);
  if (!canUploadNoteImage(filename, parsed.data.contentType, parsed.data.size)) {
    return fail("仅支持 PNG、JPG、WebP、GIF 或 AVIF 图片，且单张不超过 15MB。");
  }

  const documentId = randomUUID();
  const key = `${owner.userId}/files/${documentId}/${filename}`;
  const { supabase, userId } = owner;
  const { error } = await supabase.from("documents").insert({
    id: documentId,
    user_id: userId,
    title: `经验图片 · ${filename}`,
    document_type: "other",
    original_filename: filename,
    storage_bucket: r2BucketName(),
    storage_path: key,
    storage_provider: "cloudflare_r2",
    storage_state: "pending",
    mime_type: parsed.data.contentType,
    file_size: parsed.data.size,
    checksum: parsed.data.checksum ?? null,
    ai_visibility: "sensitive",
  });
  if (error) return fail("图片记录未能创建。", 500);
  try {
    const uploadUrl = await createUploadUrl(key, parsed.data.contentType);
    return NextResponse.json({
      documentId,
      uploadUrl,
      originalFilename: filename,
      mimeType: parsed.data.contentType,
      fileSize: parsed.data.size,
    }, { headers });
  } catch {
    await supabase.from("documents").delete()
      .eq("id", documentId)
      .eq("user_id", userId)
      .eq("storage_state", "pending");
    return fail("图片上传准备失败，请稍后重试。", 503);
  }
}
