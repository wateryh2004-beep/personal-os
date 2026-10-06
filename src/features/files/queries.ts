import { readAllFilePages } from "./read-all-pages";
import { requireOwner } from "@/lib/auth/require-owner";
import { isR2Configured } from "@/lib/adapters/cloudflare-r2";

export type FileFolder = { id: string; name: string; parent_id: string | null };
export type FileRecord = { id: string; title: string; original_filename: string; mime_type: string; file_size: number; folder_id: string | null; uploaded_at: string; created_at: string; archived_at: string | null; ai_visibility: "normal" | "sensitive" | "never"; text_extraction_status: "not_requested" | "pending" | "processing" | "completed" | "unsupported" | "too_large" | "failed"; extracted_character_count: number };

export async function getFilesWorkspace() {
  const { supabase } = await requireOwner();
  // 笔记里粘贴/上传的图片只是 Notes 的附件，不是用户文档，不该出现在 Files 列表里。
  // 两条上传路径（同源中转 + 大图直传）都会写入 entity_links（note → document, attachment），
  // 因此用关联关系排除，而不是靠 storage_path 前缀（大图直传的路径是 files/ 开头）。
  // 注：supabase-js 的 .in()/.not() 不支持查询构建器子查询（会把 builder 拼成 [object Object]），
  // 所以这里并行查关联 ID，再在客户端过滤。
  try {
    const columns = "id,title,original_filename,mime_type,file_size,folder_id,uploaded_at,created_at,archived_at,ai_visibility,text_extraction_status,extracted_character_count";
    const [folders, files, archivedFiles, noteLinks] = await Promise.all([
      readAllFilePages<FileFolder>((after, limit) => {
        let query = supabase.from("file_folders").select("id,name,parent_id").is("archived_at", null).order("id").limit(limit);
        if (after) query = query.gt("id", after);
        return query;
      }),
      readAllFilePages<FileRecord>((after, limit) => {
        let query = supabase.from("documents").select(columns).eq("storage_provider", "cloudflare_r2").eq("storage_state", "available").is("archived_at", null).order("id").limit(limit);
        if (after) query = query.gt("id", after);
        return query;
      }),
      readAllFilePages<FileRecord>((after, limit) => {
        let query = supabase.from("documents").select(columns).eq("storage_provider", "cloudflare_r2").not("archived_at", "is", null).order("id").limit(limit);
        if (after) query = query.gt("id", after);
        return query;
      }),
      readAllFilePages<{ id: string; target_id: string }>((after, limit) => {
        let query = supabase.from("entity_links").select("id,target_id").eq("source_type", "note").eq("target_type", "document").eq("relationship_type", "attachment").is("archived_at", null).order("id").limit(limit);
        if (after) query = query.gt("id", after);
        return query;
      }),
    ]);
    const noteLinkedIds = new Set(noteLinks.map((link) => link.target_id));
    return {
      configured: isR2Configured(), unavailable: false,
      folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
      files: files.filter((file) => !noteLinkedIds.has(file.id)).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
      archivedFiles: archivedFiles.filter((file) => !noteLinkedIds.has(file.id)).sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? "")),
    };
  } catch {
    return { configured: isR2Configured(), unavailable: true, folders: [], files: [], archivedFiles: [] };
  }
}
