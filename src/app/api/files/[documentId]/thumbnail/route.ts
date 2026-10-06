import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { isR2Configured, r2BucketName, readR2ObjectStream } from "@/lib/adapters/cloudflare-r2";
import {
  checkPhotoPreviewSize, createPhotoThumbnail, PhotoPreviewError, photoPreviewHeaders,
  photoPreviewTimeoutMs, readPhotoPreviewInput, supportsPhotoPreview,
} from "@/features/files/photo-thumbnail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const unavailable = (status: number) => Response.json(
  { error: "缩略图暂时不可用，可下载原文件查看。" },
  { status, headers: photoPreviewHeaders },
);

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const { documentId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) return unavailable(404);
    if (!isR2Configured()) return unavailable(503);
    const { data: file, error } = await supabase.from("documents")
      .select("storage_path,mime_type,file_size")
      .eq("id", documentId).eq("user_id", userId)
      .eq("storage_provider", "cloudflare_r2").eq("storage_bucket", r2BucketName()).eq("storage_state", "available")
      .is("archived_at", null).maybeSingle();
    if (error || !file || typeof file.storage_path !== "string" || !file.storage_path.startsWith(`${userId}/files/${documentId}/`))
      return unavailable(404);
    if (!supportsPhotoPreview(file.mime_type)) return unavailable(415);
    const expectedSize = Number(file.file_size);
    checkPhotoPreviewSize(expectedSize);

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(photoPreviewTimeoutMs)]);
    signal.throwIfAborted();
    const object = await readR2ObjectStream(file.storage_path, signal);
    if (object.size !== expectedSize) {
      await object.body.cancel().catch(() => {});
      return unavailable(422);
    }
    const input = await readPhotoPreviewInput(object.body, expectedSize, signal);
    const thumbnail = await createPhotoThumbnail(input, file.mime_type, signal);
    return new Response(new Uint8Array(thumbnail), {
      headers: {
        ...photoPreviewHeaders, "Content-Type": "image/webp",
        "Content-Length": String(thumbnail.byteLength), "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    const authenticationFailure = apiAuthenticationFailure(error);
    if (authenticationFailure) {
      for (const [key, value] of Object.entries(photoPreviewHeaders)) authenticationFailure.headers.set(key, value);
      return authenticationFailure;
    }
    if (error instanceof PhotoPreviewError)
      return unavailable(error.code === "unsupported" ? 415 : error.code === "too_large" ? 413 : 422);
    return unavailable(503);
  }
}
