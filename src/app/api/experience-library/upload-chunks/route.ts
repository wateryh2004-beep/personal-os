import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createUploadUrl, deleteR2Object, isR2Configured, readR2ObjectStream } from "@/lib/adapters/cloudflare-r2";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { canUploadNoteImage } from "@/features/files/schemas";
import { mapWithConcurrency } from "@/features/experience-library/parallel-upload";
import { experienceChunkCount, experienceChunkLength } from "@/features/experience-library/chunks";
import { matchesExperienceImageSignature } from "@/features/experience-library/image-signature";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readExact(body: ReadableStream<Uint8Array> | null, expected: number) {
  if (!body) throw new Error("missing_body");
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > expected) throw new Error("invalid_length");
      chunks.push(part.value);
    }
    if (length !== expected) throw new Error("invalid_length");
    return Buffer.concat(chunks, length);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function context(request: Request, state: "pending" | "available") {
  const { supabase, userId } = await requireOwnerApi();
  if (!isR2Configured()) throw new Error("storage_unavailable");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Error("invalid_origin");
  const documentId = request.headers.get("x-experience-document-id") ?? "";
  if (!uuid.test(documentId)) throw new Error("invalid_document");
  const { data: document, error } = await supabase.from("documents")
    .select("id,storage_path,storage_provider,storage_state,mime_type,original_filename,file_size,checksum")
    .eq("id", documentId).eq("user_id", userId).eq("storage_provider", "cloudflare_r2")
    .eq("storage_state", state).eq("upload_mode", "single").is("archived_at", null).is("vault_group_id", null).maybeSingle();
  if (error || !document || !document.storage_path.startsWith(`${userId}/files/${documentId}/`)
    || !document.checksum || !canUploadNoteImage(document.original_filename, document.mime_type, Number(document.file_size))) throw new Error("document_unavailable");
  return { document, userId, documentId, size: Number(document.file_size) };
}

const chunkKey = (userId: string, documentId: string, index: number) => `${userId}/files/${documentId}/experience-chunks-v1/${index}`;

export async function POST(request: Request) {
  try {
    const { documentId, userId, size } = await context(request, "pending");
    const rawIndex = request.headers.get("x-experience-chunk-index") ?? "";
    if (!/^\d+$/.test(rawIndex)) return fail("图片分片标识无效。");
    const index = Number(rawIndex); const length = experienceChunkLength(size, index);
    const declared = request.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) !== length)) return fail("图片分片大小不一致。", 409);
    const bytes = await readExact(request.body, length);
    const uploadUrl = await createUploadUrl(chunkKey(userId, documentId, index), "application/octet-stream");
    const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes, signal: request.signal });
    if (!response.ok) return fail("图片分片未能上传，请重试。", 502);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return apiAuthenticationFailure(error) ?? fail("图片分片暂时未完成，请重试。", 503); }
}

/** Join only this pending original's bounded chunks, then verify its complete checksum. */
export async function PATCH(request: Request) {
  try {
    const { document, userId, documentId, size } = await context(request, "pending");
    const pieces = await mapWithConcurrency(Array.from({ length: experienceChunkCount(size) }, (_, index) => index), 3, async (index) => {
      const object = await readR2ObjectStream(chunkKey(userId, documentId, index), request.signal);
      const expected = experienceChunkLength(size, index);
      if (object.size !== expected) { await object.body.cancel().catch(() => {}); return null; }
      return readExact(object.body, expected);
    });
    if (pieces.some((piece) => piece === null)) return fail("图片分片不完整，请重试。", 409);
    const bytes = Buffer.concat(pieces as Buffer[], size);
    if (createHash("sha256").update(bytes).digest("hex") !== document.checksum
      || !matchesExperienceImageSignature(bytes.subarray(0, 64), document.mime_type)) return fail("图片内容校验不一致，请重新选择原图。", 409);
    const uploadUrl = await createUploadUrl(document.storage_path, document.mime_type);
    const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": document.mime_type }, body: bytes, signal: request.signal });
    if (!response.ok) return fail("图片原件未能上传，请重试。", 502);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return apiAuthenticationFailure(error) ?? fail("图片原件暂时未完成，请重试。", 503); }
}

/** Cleanup only deterministic temporary chunks after Files confirmed availability. */
export async function DELETE(request: Request) {
  try {
    const { userId, documentId, size } = await context(request, "available");
    for (let index = 0; index < experienceChunkCount(size); index += 1) await deleteR2Object(chunkKey(userId, documentId, index));
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return apiAuthenticationFailure(error) ?? fail("临时分片清理未完成。", 503); }
}
