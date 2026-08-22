import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { normalizeMemoryKey } from "@/features/memory/types";
import { recordAgentStep, storeAgentAction } from "../persistence";
import {
  memoryCreateProposalSchema,
  memoryUpdateProposalSchema,
} from "./schemas";
import type { AssistantToolModule } from "./types";

export const memoryTools: AssistantToolModule = {
  definitions: [
    { name: "searchMemory", group: "memory_read", risk: "read", description: "搜索 Memory" },
    { name: "getRelevantMemories", group: "memory_read", risk: "read", description: "读取当前 Memory 与 Decision" },
    { name: "proposeMemory", group: "memory_proposal", risk: "proposal", description: "创建 Memory 或 Decision 提案" },
    { name: "proposeMemoryUpdate", group: "memory_proposal", risk: "proposal", description: "替换 Memory 提案" },
  ],
  build: (context) => ({
    searchMemory: tool({
      description: "搜索已确认且允许 AI 使用的 Profile/Working Memory 与当前 Decision。",
      inputSchema: z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(20).default(8) }),
      execute: async ({ query, limit }) => {
        const escaped = query.replaceAll("%", "\\%").replaceAll("_", "\\_");
        const [memories, decisions] = await Promise.all([
          context.supabase.from("personal_memories").select("id,memory_type,title,content,valid_until,review_at,confirmed_at,updated_at").or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`).eq("status", "active").eq("ai_visibility", "normal").is("archived_at", null).limit(limit),
          context.supabase.from("decisions").select("id,title,decision_text,rationale_markdown,status,decided_at,review_at,updated_at").or(`title.ilike.%${escaped}%,decision_text.ilike.%${escaped}%`).in("status", ["active", "superseded", "reversed"]).eq("ai_visibility", "normal").is("archived_at", null).limit(limit),
        ]);
        const results = [
          ...(memories.data ?? []).map((item) => ({ ...item, kind: item.memory_type, href: "/memory" })),
          ...(decisions.data ?? []).map((item) => ({ ...item, kind: "decision", href: "/memory" })),
        ].slice(0, limit);
        await recordAgentStep({ ...context, stepType: "tool", toolName: "searchMemory", title: "已搜索 Memory", summary: `找到 ${results.length} 条记忆或决定`, output: { count: results.length, sourceIds: results.map((item) => item.id) }, status: memories.error || decisions.error ? "failed" : "succeeded" });
        return { results, unavailable: Boolean(memories.error || decisions.error) };
      },
    }),
    getRelevantMemories: tool({
      description: "读取当前有效且 AI 可使用的 Memory 和最新 Decision；不返回敏感或永不使用的记录。",
      inputSchema: z.object({ includeProfile: z.boolean().default(true), includeWorking: z.boolean().default(true), includeDecisions: z.boolean().default(true), limit: z.number().int().min(1).max(30).default(12) }),
      execute: async ({ includeProfile, includeWorking, includeDecisions, limit }) => {
        const memoryTypes = [includeProfile ? "profile" : null, includeWorking ? "working" : null].filter((value): value is string => Boolean(value));
        const [memories, decisions] = await Promise.all([
          memoryTypes.length ? context.supabase.from("personal_memories").select("id,memory_type,title,content,valid_from,valid_until,review_at,confirmed_at,updated_at").in("memory_type", memoryTypes).eq("status", "active").eq("ai_visibility", "normal").is("archived_at", null).order("confirmed_at", { ascending: false }).limit(limit) : Promise.resolve({ data: [], error: null }),
          includeDecisions ? context.supabase.from("decisions").select("id,title,decision_text,rationale_markdown,status,importance,decided_at,review_at,updated_at").eq("status", "active").eq("ai_visibility", "normal").is("archived_at", null).order("decided_at", { ascending: false }).limit(limit) : Promise.resolve({ data: [], error: null }),
        ]);
        await recordAgentStep({ ...context, stepType: "tool", toolName: "getRelevantMemories", title: "已检查当前 Memory", summary: `${(memories.data ?? []).length} 条 Memory，${(decisions.data ?? []).length} 条当前决定`, output: { memoryCount: (memories.data ?? []).length, decisionCount: (decisions.data ?? []).length }, status: memories.error || decisions.error ? "failed" : "succeeded" });
        return { profileAndWorking: memories.data ?? [], currentDecisions: decisions.data ?? [], href: "/memory", unavailable: Boolean(memories.error || decisions.error) };
      },
    }),
    proposeMemory: tool({
      description: "冻结一条 Profile、Working Memory 或 Decision 提案。不会直接保存；reason 用于向用户解释证据与用途。",
      inputSchema: memoryCreateProposalSchema,
      execute: async (proposal) => {
        if (proposal.type !== "decision") {
          const key = normalizeMemoryKey(proposal.type, proposal.title);
          const { data } = await context.supabase
            .from("personal_memories")
            .select("id,title")
            .eq("memory_type", proposal.type)
            .eq("memory_key", key)
            .eq("status", "active")
            .is("archived_at", null)
            .maybeSingle();
          if (data)
            return { proposal: null, actionId: null, error: "已有同名当前 Memory，请改用更新提案。" };
        }
        return {
          proposal,
          actionId: await storeAgentAction({
            ...context,
            domain: "memory",
            actionType: "memory.create",
            payload: proposal,
            preview: {
              title: proposal.title,
              memoryType: proposal.type,
              contentPreview: proposal.content.slice(0, 300),
              reason: proposal.reason,
            },
            riskLevel: proposal.type === "decision" ? "high" : "medium",
          }),
        };
      },
    }),
    proposeMemoryUpdate: tool({
      description: "冻结替换当前 Memory 的提案。确认时仍会核对 updated_at；不允许直接覆盖或修改历史版本。",
      inputSchema: memoryUpdateProposalSchema,
      execute: async (proposal) => {
        const { data } = await context.supabase
          .from("personal_memories")
          .select("id,memory_type,title,updated_at")
          .eq("id", proposal.memoryId)
          .eq("memory_type", proposal.memoryType)
          .eq("updated_at", proposal.expectedUpdatedAt)
          .eq("status", "active")
          .is("archived_at", null)
          .maybeSingle();
        if (!data)
          return { proposal: null, actionId: null, error: "Memory 已变化或不存在，请重新读取。" };
        return {
          proposal,
          actionId: await storeAgentAction({
            ...context,
            domain: "memory",
            actionType: "memory.update",
            payload: proposal,
            preview: {
              currentTitle: data.title,
              newTitle: proposal.title,
              memoryType: proposal.memoryType,
              contentPreview: proposal.content.slice(0, 300),
              reason: proposal.reason,
            },
            riskLevel: "high",
          }),
        };
      },
    }),
  }),
};
