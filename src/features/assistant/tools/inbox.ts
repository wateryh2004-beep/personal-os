import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { inboxProposalSchema } from "@/features/inbox/schemas";
import type { AssistantToolModule } from "./types";

export const inboxTools: AssistantToolModule = {
  definitions: [
    { name: "searchInbox", group: "inbox_read", risk: "read", description: "搜索/读取当前用户 Inbox 收集内容", module: "inbox" },
    { name: "proposeInboxDestination", group: "inbox_proposal", risk: "proposal", description: "Inbox 去向提案" },
  ],
  build: (context) => ({
    searchInbox: tool({
      description: "搜索当前用户 Inbox 中未处理的收集内容；includeProcessed 为 true 时包含已处理项。",
      inputSchema: z.object({
        query: z.string().trim().max(240).optional(),
        includeProcessed: z.boolean().default(false),
        limit: z.number().int().min(1).max(50).default(15),
      }),
      execute: async ({ query, includeProcessed, limit }) => {
        let builder = context.supabase
          .from("inbox_items")
          .select("id,content_markdown,created_at,processed_at,converted_task_id,converted_note_id")
          .eq("user_id", context.userId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (query?.trim()) builder = builder.ilike("content_markdown", `%${query.replaceAll("%", "\\%")}%`);
        builder = includeProcessed
          ? builder.is("archived_at", null)
          : builder.is("processed_at", null).is("archived_at", null);
        const { data, error } = await builder;
        return { items: data ?? [], unavailable: Boolean(error) };
      },
    }),
    proposeInboxDestination: tool({
      description: "为一条 Inbox 记录生成明确去向提案，不会直接写入数据。",
      inputSchema: inboxProposalSchema,
      execute: async (proposal) => ({ proposal }),
    }),
  }),
};
