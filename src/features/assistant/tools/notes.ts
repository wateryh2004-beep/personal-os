import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { noteRevisionMatches } from "../action-guards";
import { extractQueryConcepts } from "../cognitive-router";
import { excludeAiGeneratedNoteResults, excludeAiGeneratedNotes, listRecentNotes as queryRecentNotes, readNotesBatch as queryNotesBatch } from "../retrieval/notes";
import { searchPersonalOs } from "@/features/search/queries";
import { recordAgentStep, storeAgentAction } from "../persistence";
import { noteCreateProposalSchema, noteMoveProposalSchema, noteUpdateProposalSchema } from "./schemas";
import type { AssistantToolModule } from "./types";

export const noteTools: AssistantToolModule = {
  definitions: [
    { name: "searchNotes", group: "notes_read", risk: "read", description: "搜索笔记", module: "notes", tags: ["笔记", "写过", "写的", "之前", "内容", "搜索"] },
    { name: "listRecentNotes", group: "notes_read", risk: "read", description: "按时间列出近期笔记" },
    { name: "readNotesBatch", group: "notes_read", risk: "read", description: "受限批量读取笔记" },
    { name: "readNote", group: "notes_read", risk: "read", description: "读取一篇笔记" },
    { name: "proposeNoteCreate", group: "notes_proposal", risk: "proposal", description: "创建笔记提案" },
    { name: "proposeNoteUpdate", group: "notes_proposal", risk: "proposal", description: "修改笔记提案" },
    { name: "listNoteOrganization", group: "notes_read", risk: "read", description: "列出全部文件夹与根目录散件", module: "notes", tags: ["整理", "文件夹", "归类", "根目录", "移动"] },
    { name: "proposeNoteMove", group: "notes_proposal", risk: "proposal", description: "移动笔记提案" },
  ],
  build: (context) => ({
    searchNotes: tool({
      description: "搜索当前用户的 active Notes。会扩展查询概念并返回命中位置附近的短摘录与来源链接。",
      inputSchema: z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(20).default(8) }),
      execute: async ({ query, limit }) => {
        const concepts = extractQueryConcepts(query, 4);
        const queries = concepts.length ? concepts : [query];
        const batches = await Promise.all(
          queries.map((concept) =>
            searchPersonalOs({ query: concept, domains: ["notes"], limit }).catch(() => []),
          ),
        );
        const unique = new Map<string, (typeof batches)[number][number]>();
        for (const result of batches.flat()) {
          const prior = unique.get(result.entityId);
          if (!prior || result.score > prior.score) unique.set(result.entityId, result);
        }
        const results = (await excludeAiGeneratedNoteResults(context.supabase, [...unique.values()]))
          .sort((left, right) => right.score - left.score)
          .slice(0, limit)
          .map((note) => ({
            id: note.entityId,
            title: note.title,
            snippet: note.snippet,
            updatedAt: note.sourceUpdatedAt,
            href: note.href,
            score: note.score,
          }));
        await recordAgentStep({
          ...context,
          stepType: "tool",
          toolName: "searchNotes",
          title: "已搜索笔记",
          summary: `找到 ${results.length} 篇笔记`,
          input: { queryLength: query.length, conceptCount: queries.length, limit },
          output: { count: results.length, sourceIds: results.map((item) => item.id) },
          status: "succeeded",
        });
        return { results, concepts, unavailable: false };
      },
    }),
    listRecentNotes: tool({
      description: "无需关键词，按更新时间读取当前用户近期 active Notes。适合回答‘最近在思考什么’；可包含今日日记。",
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).default(21),
        limit: z.number().int().min(1).max(30).default(16),
        includeDailyNotes: z.boolean().default(true),
      }),
      execute: async ({ days, limit, includeDailyNotes }) => {
        const result = await queryRecentNotes(context.supabase, { days, limit, includeDailyNotes });
        const notes = result.notes.map((note) => ({
          id: note.id,
          title: note.title,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          bodyPreview: note.excerpt,
          tags: note.tags,
          href: note.href,
        }));
        await recordAgentStep({
          ...context,
          stepType: "tool",
          toolName: "listRecentNotes",
          title: "已读取近期笔记",
          summary: result.unavailable ? "Notes 暂时不可用" : `覆盖最近 ${days} 天，共 ${notes.length} 篇`,
          input: { days, limit, includeDailyNotes },
          output: { count: notes.length, sourceIds: notes.map((note) => note.id) },
          status: result.unavailable ? "failed" : "succeeded",
        });
        return { notes, windowDays: days, unavailable: result.unavailable };
      },
    }),
    readNotesBatch: tool({
      description: "批量读取已检索到的 active Notes，带严格数量和字符预算。不可读取回收站或其他用户数据。",
      inputSchema: z.object({
        noteIds: z.array(z.string().uuid()).min(1).max(12),
        maxCharsPerNote: z.number().int().min(500).max(8_000).default(4_000),
        maxTotalChars: z.number().int().min(1_000).max(32_000).default(20_000),
      }),
      execute: async ({ noteIds, maxCharsPerNote, maxTotalChars }) => {
        const result = await queryNotesBatch(context.supabase, {
          noteIds,
          maxNotes: 12,
          maxCharsPerNote,
          maxTotalChars,
        });
        await recordAgentStep({
          ...context,
          stepType: "tool",
          toolName: "readNotesBatch",
          title: "已批量读取笔记",
          summary: result.unavailable ? "Notes 暂时不可用" : `读取 ${result.notes.length} 篇笔记`,
          input: { noteCount: noteIds.length, maxCharsPerNote, maxTotalChars },
          output: { count: result.notes.length, sourceIds: result.notes.map((note) => note.id) },
          status: result.unavailable ? "failed" : "succeeded",
        });
        return result;
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
        const humanNote = (await excludeAiGeneratedNotes(context.supabase, data ? [data] : []))[0];
        const note = humanNote
          ? {
              id: humanNote.id,
              title: humanNote.title,
              bodyMarkdown: humanNote.body_markdown.slice(0, maxChars),
              truncated: humanNote.body_markdown.length > maxChars,
              revision: humanNote.revision,
              contentHash: humanNote.content_hash,
              updatedAt: humanNote.updated_at,
              href: `/notes/${humanNote.id}`,
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
    listNoteOrganization: tool({
      description: "列出当前用户所有文件夹（含每夹笔记数与代表性标题）与根目录散件清单（未归入任何文件夹的笔记），用于整理归类判断。",
      inputSchema: z.object({ maxRootNotes: z.number().int().min(1).max(200).default(100) }),
      execute: async ({ maxRootNotes }) => {
        const [foldersResult, folderAssignments, recentTitled, rootResult, rootCountResult] = await Promise.all([
          context.supabase
            .from("note_folders")
            .select("id,name")
            .eq("user_id", context.userId)
            .is("archived_at", null)
            .order("position", { ascending: true })
            .order("name", { ascending: true }),
          context.supabase
            .from("notes")
            .select("folder_id")
            .eq("user_id", context.userId)
            .eq("status", "active")
            .is("deleted_at", null)
            .is("archived_at", null)
            .not("folder_id", "is", null),
          context.supabase
            .from("notes")
            .select("folder_id,title")
            .eq("user_id", context.userId)
            .eq("status", "active")
            .is("deleted_at", null)
            .is("archived_at", null)
            .not("folder_id", "is", null)
            .order("updated_at", { ascending: false })
            .limit(300),
          context.supabase
            .from("notes")
            .select("id,title,updated_at")
            .eq("user_id", context.userId)
            .eq("status", "active")
            .is("deleted_at", null)
            .is("archived_at", null)
            .is("folder_id", null)
            .order("updated_at", { ascending: false })
            .limit(maxRootNotes),
          context.supabase
            .from("notes")
            .select("id", { count: "exact", head: true })
            .eq("user_id", context.userId)
            .eq("status", "active")
            .is("deleted_at", null)
            .is("archived_at", null)
            .is("folder_id", null),
        ]);
        const countByFolder = new Map<string, number>();
        for (const row of folderAssignments.data ?? []) {
          const folderId = row.folder_id as string | null;
          if (folderId) countByFolder.set(folderId, (countByFolder.get(folderId) ?? 0) + 1);
        }
        const titlesByFolder = new Map<string, string[]>();
        for (const row of recentTitled.data ?? []) {
          const folderId = row.folder_id as string | null;
          if (!folderId) continue;
          const titles = titlesByFolder.get(folderId) ?? [];
          if (titles.length < 3) titles.push(row.title as string);
          titlesByFolder.set(folderId, titles);
        }
        const folders = (foldersResult.data ?? []).map((folder) => ({
          id: folder.id,
          name: folder.name,
          noteCount: countByFolder.get(folder.id as string) ?? 0,
          sampleTitles: titlesByFolder.get(folder.id as string) ?? [],
        }));
        const rootNotes = (rootResult.data ?? []).map((note) => ({
          id: note.id,
          title: note.title,
          updatedAt: note.updated_at,
          href: `/notes/${note.id}`,
        }));
        const totalRoot = foldersResult.error ? 0 : (rootCountResult.count ?? rootNotes.length);
        await recordAgentStep({
          ...context,
          stepType: "tool",
          toolName: "listNoteOrganization",
          title: "已列出笔记库结构",
          summary: `共 ${folders.length} 个文件夹，根目录散件 ${rootNotes.length}/${totalRoot} 篇`,
          input: { maxRootNotes },
          output: { folderCount: folders.length, rootNoteCount: rootNotes.length, rootNoteIds: rootNotes.map((note) => note.id) },
          status: foldersResult.error ? "failed" : "succeeded",
        });
        return { folders, rootNotes, rootTotal: totalRoot, unavailable: Boolean(foldersResult.error) };
      },
    }),
    proposeNoteMove: tool({
      description: "冻结笔记移动提案：把一篇根目录散件移入已有文件夹，或移入一个新建文件夹。不会直接移动，用户确认后才执行。",
      inputSchema: noteMoveProposalSchema,
      execute: async (proposal) => {
        const { data: note } = await context.supabase
          .from("notes")
          .select("id,title")
          .eq("id", proposal.noteId)
          .eq("status", "active")
          .is("deleted_at", null)
          .is("archived_at", null)
          .maybeSingle();
        if (!note)
          return { proposal: null, actionId: null, error: "这篇笔记不存在或已删除，请重新列出后再提案。" };
        let folderName: string | null = null;
        if (proposal.destinationFolderId) {
          const { data: folder } = await context.supabase
            .from("note_folders")
            .select("id,name")
            .eq("id", proposal.destinationFolderId)
            .is("archived_at", null)
            .maybeSingle();
          if (!folder) return { proposal: null, actionId: null, error: "目标文件夹不存在或已归档，请重新列出文件夹。" };
          folderName = folder.name;
        } else if (proposal.newFolderName) {
          const { data: existing } = await context.supabase
            .from("note_folders")
            .select("id,name")
            .eq("user_id", context.userId)
            .is("parent_id", null)
            .is("archived_at", null)
            .ilike("name", proposal.newFolderName.trim())
            .maybeSingle();
          if (existing)
            return { proposal: null, actionId: null, error: `已存在同名文件夹「${existing.name}」，请改用 destinationFolderId 指向它，不要重复新建。` };
          folderName = proposal.newFolderName;
        }
        return {
          proposal,
          actionId: await storeAgentAction({
            ...context,
            domain: "notes",
            actionType: "notes.move",
            payload: proposal,
            preview: {
              noteId: proposal.noteId,
              title: proposal.noteTitle,
              destinationFolderId: proposal.destinationFolderId,
              newFolderName: proposal.newFolderName,
              folderName,
              reason: proposal.reason,
            },
            riskLevel: "low",
          }),
        };
      },
    }),
  }),
};
