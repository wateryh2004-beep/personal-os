import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createUploadUrl, isR2Configured } from "@/lib/adapters/cloudflare-r2";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { canUploadNoteImage } from "@/features/files/schemas";
import { matchesExperienceImageSignature } from "@/features/experience-library/image-signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const limit = 4 * 1024 * 1024;
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });

async function readBoundedBody(request: Request, expected: number) {
  if (!request.body) throw new Error("empty_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > expected || length > limit) throw new Error("oversized_body");
      chunks.push(part.value);
    }
    return Buffer.concat(chunks, length);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Same-origin relay for small images. Finalization remains the existing Files seal flow. */
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    if (!isR2Configured()) return fail("私有图片存储尚未配置。", 503);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return fail("请求来源无效。", 403);
    const documentId = request.headers.get("x-experience-document-id") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) return fail("图片标识无效。");
    const lengthHeader = request.headers.get("content-length");
    if (lengthHeader && (!/^\d+$/.test(lengthHeader) || Number(lengthHeader) > limit)) return fail("图片超过同源上传上限。", 413);
    const { data: doc, error } = await supabase.from("documents")
      .select("id,storage_path,storage_provider,storage_state,mime_type,original_filename,file_size,checksum")
      .eq("id", documentId).eq("user_id", userId).eq("storage_provider", "cloudflare_r2")
      .eq("storage_state", "pending").eq("upload_mode", "single").is("archived_at", null).is("vault_group_id", null).maybeSingle();
    if (error || !doc || !doc.storage_path.startsWith(`${userId}/files/${documentId}/`)) return fail("待上传图片不存在或无权访问。", 404);
    const size = Number(doc.file_size);
    if (size > limit || !canUploadNoteImage(doc.original_filename, doc.mime_type, size)) return fail("图片格式或大小不受支持。", 413);
    if (request.headers.get("content-type") !== doc.mime_type) return fail("图片类型与上传记录不一致。", 409);
    const bytes = await readBoundedBody(request, size);
    if (bytes.byteLength !== size || !doc.checksum || createHash("sha256").update(bytes).digest("hex") !== doc.checksum) return fail("图片内容校验不一致，请重新选择图片。", 409);
    if (!matchesExperienceImageSignature(bytes.subarray(0, 64), doc.mime_type)) return fail("图片内容与文件格式不一致。", 415);
    const uploadUrl = await createUploadUrl(doc.storage_path, doc.mime_type);
    const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": doc.mime_type }, body: bytes, signal: request.signal });
    if (!response.ok) return fail("图片未能传入私有存储，请重试。", 502);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? fail("图片上传暂时未完成，请重试。", 503);
  }
}
