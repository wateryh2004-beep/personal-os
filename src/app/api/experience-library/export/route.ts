import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

async function ownerRows<T>(
  load: (after: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  let after: string | null = null;
  for (let page = 0; page < 40; page += 1) {
    const { data, error } = await load(after);
    if (error || !data) throw new Error("experience_export_failed");
    if (!data.length) return rows;
    rows.push(...data);
    const last = data[data.length - 1] as T & { id?: string };
    if (!last.id || last.id === after) throw new Error("experience_export_pagination_failed");
    after = last.id;
    if (rows.length > 25_000) throw new Error("experience_export_too_large");
  }
  throw new Error("experience_export_pagination_failed");
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
      return Response.json({ error: "请从 Personal OS 发起导出。" }, { status: 403, headers });
    }
    const entries = await ownerRows((after) => {
      let query = supabase.from("experience_library_entries")
        .select("id,source_url,title,tags,ai_summary,ai_key_points,ai_status,ai_error_code,ai_provider,ai_model,ai_analyzed_at,personal_note,review_status,created_at,updated_at,archived_at")
        .eq("user_id", userId)
        .order("id")
        .limit(500);
      if (after) query = query.gt("id", after);
      return query;
    });
    const noteVersions = await ownerRows((after) => {
      let query = supabase.from("experience_library_note_versions").select("id,entry_id,personal_note,review_status,created_at").eq("user_id", userId).order("id").limit(500);
      if (after) query = query.gt("id", after);
      return query;
    });
    const captures = await ownerRows((after) => {
      let query = supabase.from("experience_library_captures")
        .select("id,entry_id,request_id,capture_type,raw_content,content_sha256,segments,speaker,created_at")
        .eq("user_id", userId)
        .order("id")
        .limit(500);
      if (after) query = query.gt("id", after);
      return query;
    });
    const media = await ownerRows((after) => {
      let query = supabase.from("experience_library_media")
        .select("id,entry_id,capture_id,document_id,selection_start,selection_end,selection_quote,position,caption,source_kind,created_at,updated_at,archived_at")
        .eq("user_id", userId)
        .order("id")
        .limit(500);
      if (after) query = query.gt("id", after);
      return query;
    });
    const documentIds = [...new Set(media.flatMap((item) => item.document_id ? [item.document_id] : []))];
    const documentIdSet = new Set(documentIds);
    const documents = documentIds.length
      ? (await ownerRows((after) => {
        let query = supabase.from("documents")
          .select("id,title,original_filename,mime_type,file_size,checksum,storage_provider,storage_state,confidentiality_level,ai_visibility,created_at,uploaded_at,archived_at")
          .eq("user_id", userId)
          .eq("storage_provider", "cloudflare_r2")
          .order("id")
          .limit(500);
        if (after) query = query.gt("id", after);
        return query;
      })).filter((document) => documentIdSet.has(document.id))
      : [];
    const exportedAt = new Date().toISOString();
    return Response.json({
      format: "personal-os-experience-library/v1",
      exportedAt,
      inventory: {
        entries: entries.length,
        captures: captures.length,
        mediaRelations: media.length,
        documents: documents.length,
      },
      entries,
      noteVersions,
      captures,
      media,
      documents,
      recovery: {
        metadata: "This JSON restores stable IDs and text/media relationships.",
        originals: "Use the Files portable export or system snapshot plus the matching Files original package. This JSON contains no image bytes, signed URL, storage path, API key or ciphertext.",
      },
    }, {
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="experience-library-${exportedAt.slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? Response.json({
      error: "经验资料导出未完成，请稍后重试。",
    }, { status: 500, headers });
  }
}
