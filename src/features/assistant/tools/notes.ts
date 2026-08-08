import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { noteRevisionMatches } from "../action-guards";
import { recordAgentStep, storeAgentAction } from "../persistence";
import { noteCreateProposalSchema, noteUpdateProposalSchema } from "./schemas";
import type { AssistantToolModule } from "./types";

export const noteTools: AssistantToolModule = {
  definitions: [
    { name: "searchNotes", group: "notes_read", risk: "read", description: "搜索笔记" },
    { name: "readNote", group: "notes_read", risk: "read", description: "读取一篇笔记" },
    { name: "proposeNoteCreate", group: "notes_proposal", risk: "proposal", description: "创建笔记提案" },
    { name: "proposeNoteUpdate", group: "notes_proposal", risk: "proposal", description: "修改笔记提案" },
  ],
  build: (context) => ({
    searchNotes: tool({
      description: "搜索当前用户的 active Notes，返回短摘要与来源链接。",
      inputSchema: z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(20).default(8) }),
      execute: async ({ query, limit }) => {
        const escaped = query.replaceAll("%", "\\%").replaceAll("_", "\\_");
        const { data, error } = await context.supabase
          .from("notes")
          .select("id,title,body_markdown,revision,content_hash,updated_at")
          .or(`title.ilike.%${escaped}%,body_markdown.ilike.%${escaped}%`)
          .eq("status", "active")
          .is("deleted_at", null)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(limit);
        const results = (data ?? []).map((note) => ({
          id: note.id,
          title: note.title,
          snippet: note.body_markdown.replace(/\s+/g, " ").slice(0, 360),
          revision: note.revision,
          contentHash: note.content_hash,
          updatedAt: note.updated_at,
          href: `/notes/${note.id}`,
        }));
        await recordAgentStep({
          ...context,
          stepType: "tool",
          toolName: "searchNotes",
          title: "已搜索笔记",
          summary: error ? "Notes 暂时不可用" : `找到 ${results.length} 篇笔记`,
          input: { queryLength: query.length, limit },
          output: { count: results.length, sourceIds: results.map((item) => item.id) },
          status: error ? "failed" : "succeeded",
        });
        return { results, unavailable: Boolean(error) };
      },
    }),
    readNote: tool({
      description: "读取当前用户的一篇 active Note。正文最多返回指定长度，不能读取回收站或其他用户数据。",
      inputSchema: z.object({ noteId: z.string().uuid(), maxChars: z.number().int().min(500).max(12_000).default(6000) }),
      execute: async ({ noteId, maxChars }) => {
        const { data, error } = await context.supabase
          .from("notes")
          .select("id,title,body_markdown,revision,content_hash,updated_at")
          .eq("id", noteId)
          .eq("status", "active")
          .is("deleted_at", null)
          .is("archived_at", null)
          .maybeSingle();
        const note = data
          ? {
              id: data.id,
              title: data.title,
              bodyMarkdown: data.body_markdown.slice(0, maxChars),
              truncated: data.body_markdown.length > maxChars,
              revision: data.revision,
              contentHash: data.content_hash,
              updatedAt: data.updated_at,
              href: `/notes/${data.id}`,
            }
          : null;
        await recordAgentStep({
          ...context,
          stepType: "tool",
          toolName: "readNote",
          title: "已读取笔记",
          summary: note ? note.title : "笔记不存在、已删除或无权读取",
          input: { noteId, maxChars },
          output: { found: Boolean(note), sourceId: note?.id },
          status: error || !note ? "failed" : "succeeded",
        });
        return { note, unavailable: Boolean(error) };
      },
    }),
    proposeNoteCreate: tool({
      description: "冻结新建 Note 提案。不会直接创建，用户确认后才进入 Notes。",
      inputSchema: noteCreateProposalSchema,
      execute: async (proposal) => {
        if (proposal.folderId) {
          const { data } = await context.supabase
            .from("note_folders")
            .select("id,name")
            .eq("id", proposal.folderId)
            .is("archived_at", null)
            .maybeSingle();
          if (!data) return { proposal: null, actionId: null, error: "目标文件夹不存在。" };
        }
        return {
          proposal,
          actionId: await storeAgentAction({
            ...context,
            domain: "notes",
            actionType: "notes.create",
            payload: proposal,
            preview: { title: proposal.title, bodyPreview: proposal.bodyMarkdown.slice(0, 500), folderId: proposal.folderId, summaryOfChanges: proposal.summaryOfChanges },
            riskLevel: "low",
          }),
        };
      },
    }),
    proposeNoteUpdate: tool({
      description: "冻结 Note 修改提案。必须携带读取时的 revision 和正文 hash；确认时会再次检查冲突。",
      inputSchema: noteUpdateProposalSchema,
      execute: async (proposal) => {
        const { data } = await context.supabase
          .from("notes")
          .select("id,title,body_markdown,revision,content_hash")
          .eq("id", proposal.noteId)
          .eq("status", "active")
          .is("deleted_at", null)
          .is("archived_at", null)
          .maybeSingle();
        if (!noteRevisionMatches(data ? {
          revision: data.revision,
          bodyMarkdown: data.body_markdown,
          contentHash: data.content_hash,
        } : null, {
          revision: proposal.expectedRevision,
          contentHash: proposal.currentBodyHash,
        }))
          return { proposal: null, actionId: null, error: "这篇笔记已变化，请重新读取后再生成提案。" };
        return {
          proposal,
          actionId: await storeAgentAction({
            ...context,
            domain: "notes",
            actionType: "notes.update",
            payload: proposal,
            preview: { noteId: proposal.noteId, currentTitle: proposal.currentTitle, newTitle: proposal.newTitle, bodyPreview: proposal.suggestedBody.slice(0, 500), summaryOfChanges: proposal.summaryOfChanges },
            riskLevel: "medium",
          }),
        };
      },
    }),
  }),
};
