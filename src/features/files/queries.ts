import { requireOwner } from "@/lib/auth/require-owner";
import { isR2Configured } from "@/lib/adapters/cloudflare-r2";

export type FileFolder = { id: string; name: string; parent_id: string | null };
export type FileRecord = { id: string; title: string; original_filename: string; mime_type: string; file_size: number; folder_id: string | null; uploaded_at: string; created_at: string; text_extraction_status: "not_requested" | "pending" | "processing" | "completed" | "unsupported" | "too_large" | "failed"; extracted_character_count: number };

export async function getFilesWorkspace() {
  const { supabase } = await requireOwner();
  // 笔记里粘贴/上传的图片只是 Notes 的附件，不是用户文档，不该出现在 Files 列表里。
  // 两条上传路径（同源中转 + 大图直传）都会写入 entity_links（note → document, attachment），
  // 因此用关联关系排除，而不是靠 storage_path 前缀（大图直传的路径是 files/ 开头）。
  const noteAttachments = supabase
    .from("entity_links")
    .select("target_id")
    .eq("source_type", "note")
    .eq("target_type", "document")
    .eq("relationship_type", "attachment");
  const [folders, files] = await Promise.all([
    supabase.from("file_folders").select("id,name,parent_id").is("archived_at", null).order("position").order("name"),
    supabase.from("documents").select("id,title,original_filename,mime_type,file_size,folder_id,uploaded_at,created_at,text_extraction_status,extracted_character_count").eq("storage_provider", "cloudflare_r2").eq("storage_state", "available").is("archived_at", null).not("id", "in", noteAttachments).order("uploaded_at", { ascending: false }),
  ]);
  return {
    configured: isR2Configured(),
    unavailable: Boolean(folders.error || files.error),
    folders: (folders.data ?? []) as FileFolder[],
    files: (files.data ?? []) as FileRecord[],
  };
}
