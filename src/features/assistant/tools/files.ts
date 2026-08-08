import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { recordAgentStep } from "../persistence";
import type { AssistantToolModule } from "./types";

const metadataSelect = "id,title,original_filename,mime_type,file_size,document_type,folder_id,storage_state,text_extraction_status,extracted_character_count,uploaded_at,updated_at,file_folders(name)";

export const fileTools: AssistantToolModule = {
  definitions: [
    { name: "searchFiles", group: "files_read", risk: "read", description: "搜索文件元数据" },
    { name: "readFileMetadata", group: "files_read", risk: "read", description: "读取文件元数据" },
    { name: "readFileText", group: "files_read", risk: "read", description: "读取已解析的文件文本" },
  ],
  build: (context) => ({
    searchFiles: tool({
      description: "只搜索私有文件元数据，不读取 R2 对象正文，不返回 storage path 或签名 URL。",
      inputSchema: z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(20).default(10) }),
      execute: async ({ query, limit }) => {
        const escaped = query.replaceAll("%", "\\%").replaceAll("_", "\\_");
        const { data, error } = await context.supabase.from("documents").select(`${metadataSelect},extracted_text`).or(`title.ilike.%${escaped}%,original_filename.ilike.%${escaped}%,extracted_text.ilike.%${escaped}%`).eq("storage_state", "available").is("archived_at", null).order("updated_at", { ascending: false }).limit(limit);
        const files = (data ?? []).map(({ extracted_text, ...item }) => ({ ...item, textSnippet: extracted_text?.replace(/\s+/g, " ").slice(0, 360) ?? null, href: "/files" }));
        await recordAgentStep({ ...context, stepType: "tool", toolName: "searchFiles", title: "已搜索文件", summary: error ? "Files 暂不可用" : `找到 ${files.length} 个文件`, output: { count: files.length }, status: error ? "failed" : "succeeded" });
        return { files, unavailable: Boolean(error) };
      },
    }),
    readFileMetadata: tool({
      description: "读取一个属于当前用户且 available 的文件元数据；绝不返回对象正文、密钥或签名 URL。",
      inputSchema: z.object({ documentId: z.string().uuid() }),
      execute: async ({ documentId }) => {
        const { data, error } = await context.supabase.from("documents").select(metadataSelect).eq("id", documentId).eq("storage_state", "available").is("archived_at", null).maybeSingle();
        return { file: data ? { ...data, href: "/files" } : null, unavailable: Boolean(error) };
      },
    }),
    readFileText: tool({
      description: "读取当前用户一个 available 文件的已解析纯文本。最多返回指定长度；不返回 R2 路径、对象或签名 URL。",
      inputSchema: z.object({ documentId: z.string().uuid(), maxChars: z.number().int().min(500).max(12_000).default(6000) }),
      execute: async ({ documentId, maxChars }) => {
        const { data, error } = await context.supabase.from("documents").select("id,title,original_filename,text_extraction_status,extracted_text,updated_at").eq("id", documentId).eq("storage_state", "available").is("archived_at", null).maybeSingle();
        const text = data?.text_extraction_status === "completed" ? data.extracted_text ?? "" : "";
        await recordAgentStep({ ...context, stepType: "tool", toolName: "readFileText", title: "已读取文件文本", summary: data ? data.title : "文件不存在或无权读取", output: { found: Boolean(data), status: data?.text_extraction_status ?? null, returnedCharacters: Math.min(text.length, maxChars) }, status: error || !data ? "failed" : "succeeded" });
        return { file: data ? { id: data.id, title: data.title, originalFilename: data.original_filename, extractionStatus: data.text_extraction_status, text: text.slice(0, maxChars), truncated: text.length > maxChars, updatedAt: data.updated_at, href: "/files" } : null, unavailable: Boolean(error) };
      },
    }),
  }),
};
