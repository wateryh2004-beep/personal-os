import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { searchPersonalOs } from "@/features/search/queries";
import type { SearchDomain } from "@/features/search/types";
import { recordAgentStep } from "../persistence";
import { matchedExcerpt } from "../retrieval/excerpts";
import type { AssistantToolModule } from "./types";

const domains = ["notes", "career", "files", "tasks", "calendar", "reviews", "memory", "projects", "shopping", "travel"] as const;
const indexed = new Set<SearchDomain>(["notes", "career", "files", "tasks", "calendar", "reviews", "projects", "shopping", "travel"]);

export const searchTools: AssistantToolModule = {
  definitions: [{ name: "searchPersonalOs", group: "search", risk: "read", description: "跨域搜索 Personal OS" }],
  build: (context) => ({
    searchPersonalOs: tool({
      description: "跨 Notes、Career、Files、Tasks、Calendar、Reviews、Memory、Projects、Shopping 与 Travel 搜索。返回紧凑来源，不返回整篇正文。",
      inputSchema: z.object({ query: z.string().trim().min(1).max(200), domains: z.array(z.enum(domains)).max(domains.length).optional(), limit: z.number().int().min(1).max(20).default(10) }),
      execute: async ({ query, domains: requested, limit }) => {
        const selected = requested ?? [...domains];
        const baseDomains = selected.filter((domain) => indexed.has(domain as SearchDomain)) as SearchDomain[];
        const [base, memory, projects] = await Promise.all([
          baseDomains.length ? searchPersonalOs({ query, domains: baseDomains, limit }).catch(() => []) : [],
          selected.includes("memory")
            ? context.supabase
                .from("personal_memories")
                .select("id,title,content,updated_at")
                .or(`title.ilike.%${query.replaceAll("%", "\\%")}%,content.ilike.%${query.replaceAll("%", "\\%")}%`)
                .eq("status", "active")
                .neq("ai_visibility", "never")
                .is("archived_at", null)
                .limit(limit)
            : Promise.resolve({ data: [], error: null }),
          selected.includes("projects")
            ? context.supabase
                .from("projects")
                .select("id,name,description,status,updated_at")
                .or(`name.ilike.%${query.replaceAll("%", "\\%")}%,description.ilike.%${query.replaceAll("%", "\\%")}%`)
                .is("archived_at", null)
                .limit(limit)
            : Promise.resolve({ data: [], error: null }),
        ]);
        const results = [
          ...base.map((item) => ({ id: item.entityId, domain: item.domain, title: item.title, snippet: item.snippet, href: item.href, updatedAt: item.sourceUpdatedAt })),
          ...(memory.data ?? []).map((item) => ({ id: item.id, domain: "memory", title: item.title, snippet: matchedExcerpt(item.content, [query], 360), href: "/memory", updatedAt: item.updated_at })),
          ...(projects.data ?? []).map((item) => ({ id: item.id, domain: "projects", title: item.name, snippet: item.description ? matchedExcerpt(item.description, [query], 360) : item.status, href: "/projects", updatedAt: item.updated_at })),
        ].slice(0, limit);
        await recordAgentStep({
          ...context,
          stepType: "tool",
          toolName: "searchPersonalOs",
          title: "已搜索 Personal OS",
          summary: `找到 ${results.length} 条跨模块结果`,
          input: { queryLength: query.length, domains: selected, limit },
          output: { count: results.length, sources: results.map(({ id, domain, title, href }) => ({ id, domain, title, href })) },
        });
        return { results };
      },
    }),
  }),
};
