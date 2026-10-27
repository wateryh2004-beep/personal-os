import { z } from "zod";
import { fileRecordSchema } from "@/features/files/record-schema";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
const columns = "id,title,original_filename,mime_type,file_size,folder_id,uploaded_at,created_at,archived_at,ai_visibility,text_extraction_status,extracted_character_count,mutation_revision";
/** A single list row, never original bytes, extracted text, paths or signed URLs. */
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const { documentId } = await params;
    if (!z.string().uuid().safeParse(documentId).success) return Response.json({ error: "文件标识无效。" }, { status: 400, headers });
    const [document, attachment] = await Promise.all([
      supabase.from("documents").select(columns).eq("id", documentId).eq("user_id", userId)
        .eq("storage_provider", "cloudflare_r2").eq("storage_state", "available")
        .is("archived_at", null).is("vault_group_id", null).maybeSingle(),
      supabase.from("entity_links").select("id").eq("user_id", userId).eq("target_id", documentId)
        .eq("source_type", "note").eq("target_type", "document").eq("relationship_type", "attachment")
        .is("archived_at", null).limit(1),
    ]);
    if (document.error || attachment.error) return Response.json({ error: "文件状态暂未读取，请稍后重试。" }, { status: 503, headers });
    const file = document.data && !attachment.data?.length ? fileRecordSchema.parse(document.data) : null;
    return Response.json({ file }, { headers });
  } catch (error) {
    const failure = apiAuthenticationFailure(error);
    if (failure) { for (const [key, value] of Object.entries(headers)) failure.headers.set(key, value); return failure; }
    return Response.json({ error: "文件状态暂未读取，请稍后重试。" }, { status: 503, headers });
  }
}
