import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readR2ObjectStream } from "@/lib/adapters/cloudflare-r2";
import { exportPageSize, type ExportDocument, type ExportRow, type ExportSource } from "./portable";

const columns = {
  file_folders: "id,name,parent_id,position,created_at,updated_at,archived_at",
  documents: "id,title,document_type,original_filename,mime_type,file_size,checksum,confidentiality_level,uploaded_at,created_at,updated_at,archived_at,folder_id,storage_provider,storage_state,storage_path,ai_visibility,text_extraction_status,extracted_text,extracted_character_count,text_extraction_error_code,text_extracted_at,text_extraction_method,text_extraction_engine_version,text_extraction_model_version,text_extraction_source_sha256,text_extraction_page_count,text_extraction_empty_pages",
  entity_links: "id,source_type,source_id,target_type,target_id,relationship_type,created_via,metadata,created_at,updated_at,archived_at",
} as const;

/** Keyset paging must continue until an empty page, even below the requested page size. */
export async function* exportRows(supabase: SupabaseClient, userId: string, table: keyof typeof columns, signal: AbortSignal): AsyncGenerator<ExportRow> {
  let cursor: string | null = null;
  while (true) {
    signal.throwIfAborted();
    let query = supabase.from(table).select(columns[table]).eq("user_id", userId).order("id", { ascending: true }).limit(exportPageSize).abortSignal(signal);
    if (table === "documents") query = query.eq("storage_provider", "cloudflare_r2");
    if (table === "entity_links") query = query.or("source_type.eq.document,target_type.eq.document");
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error("files_export_query_failed");
    if (data.length === 0) return;
    for (const row of data as unknown as ExportRow[]) {
      if (typeof row.id !== "string" || (cursor !== null && row.id <= cursor)) throw new Error("files_export_pagination_failed");
      cursor = row.id; yield row;
    }
  }
}

export function createExportSource(supabase: SupabaseClient, userId: string, signal: AbortSignal): ExportSource {
  return {
    folders: () => exportRows(supabase, userId, "file_folders", signal),
    documents: () => exportRows(supabase, userId, "documents", signal) as AsyncIterable<ExportDocument>,
    relationships: () => exportRows(supabase, userId, "entity_links", signal),
    openObject(document, objectSignal) {
      // Defense in depth: never fetch an unowned key even if metadata integrity was compromised.
      if (!document.storage_path.startsWith(`${userId}/`)) throw new Error("files_export_invalid_object_owner");
      return readR2ObjectStream(document.storage_path, objectSignal);
    },
  };
}
