import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { storeAgentAction } from "../persistence";
import { shoppingCreateProposalSchema, travelCreateProposalSchema } from "./schemas";
import type { AssistantToolModule } from "./types";

export const lifeTools: AssistantToolModule = { definitions: [
  { name: "listShopping", group: "shopping_read", risk: "read", description: "读取真实待购清单", module: "shopping" },
  { name: "searchShopping", group: "shopping_read", risk: "read", description: "按标题搜索真实待购物品", module: "shopping" },
  { name: "proposeShoppingCreate", group: "shopping_proposal", risk: "proposal", description: "生成待购结构化提案并提示重复候选", module: "shopping" },
  { name: "listTrips", group: "travel_read", risk: "read", description: "读取真实旅行计划", module: "travel" },
  { name: "searchTrips", group: "travel_read", risk: "read", description: "按目的地或标题搜索真实旅行计划", module: "travel" },
  { name: "proposeTravelCreate", group: "travel_proposal", risk: "proposal", description: "生成旅行愿景创建提案", module: "travel" },
], build: (context) => ({
  listShopping: tool({ description: "读取当前用户的真实待购清单。不得根据对话猜测。", inputSchema: z.object({ includeCompleted: z.boolean().default(false), limit: z.number().int().min(1).max(100).default(30) }), execute: async ({ includeCompleted, limit }) => { const query = context.supabase.from("purchase_items").select("id,title,status,category,price_cny,necessity,cooldown_until,created_at").eq("user_id", context.userId).is("archived_at", null).order("created_at", { ascending: false }).limit(limit); if (!includeCompleted) query.not("status", "in", "(purchased,abandoned)"); const { data, error } = await query; return { items: data ?? [], unavailable: Boolean(error) }; } }),
  searchShopping: tool({ description: "按标题搜索当前用户的真实待购物品。", inputSchema: z.object({ query: z.string().trim().min(1).max(240), limit: z.number().int().min(1).max(30).default(10) }), execute: async ({ query, limit }) => { const { data, error } = await context.supabase.from("purchase_items").select("id,title,status,category,price_cny,necessity,cooldown_until,created_at").eq("user_id", context.userId).ilike("title", `%${query.replaceAll("%", "\\%")}%`).is("archived_at", null).limit(limit); return { items: data ?? [], unavailable: Boolean(error) }; } }),
  proposeShoppingCreate: tool({ description: "冻结待购创建提案。创建前会检查标题相似的活跃待购；不要直接写入。", inputSchema: shoppingCreateProposalSchema, execute: async (proposal) => { const { data } = await context.supabase.from("purchase_items").select("id,title,status,price_cny").ilike("title", `%${proposal.title.replaceAll("%", "\\%")}%`).is("archived_at", null).not("status", "in", "(abandoned,archived)").limit(5); return { proposal, possibleDuplicates: data ?? [], actionId: await storeAgentAction({ ...context, domain: "shopping", actionType: "shopping.create", payload: proposal, preview: { ...proposal, possibleDuplicates: data ?? [] }, riskLevel: "medium" }) }; } }),
  listTrips: tool({ description: "读取当前用户真实的旅行计划。不得根据对话猜测。", inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(30) }), execute: async ({ limit }) => { const { data, error } = await context.supabase.from("trips").select("id,title,status,destination_label,start_date,end_date,description,created_at").eq("user_id", context.userId).is("archived_at", null).order("created_at", { ascending: false }).limit(limit); return { trips: data ?? [], unavailable: Boolean(error) }; } }),
  searchTrips: tool({ description: "按标题或目的地搜索当前用户真实的旅行计划。", inputSchema: z.object({ query: z.string().trim().min(1).max(240), limit: z.number().int().min(1).max(30).default(10) }), execute: async ({ query, limit }) => { const { data, error } = await context.supabase.from("trips").select("id,title,status,destination_label,start_date,end_date,description,created_at").eq("user_id", context.userId).or(`title.ilike.%${query.replaceAll("%", "\\%")}%,destination_label.ilike.%${query.replaceAll("%", "\\%")}%`).is("archived_at", null).limit(limit); return { trips: data ?? [], unavailable: Boolean(error) }; } }),
  proposeTravelCreate: tool({ description: "冻结旅行愿景创建提案；不会直接写入。", inputSchema: travelCreateProposalSchema, execute: async (proposal) => ({ proposal, actionId: await storeAgentAction({ ...context, domain: "travel", actionType: "travel.create", payload: proposal, preview: proposal, riskLevel: "low" }) }) }),
}) };
