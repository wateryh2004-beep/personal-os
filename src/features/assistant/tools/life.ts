import "server-only";
import { tool } from "ai";
import { storeAgentAction } from "../persistence";
import { shoppingCreateProposalSchema, travelCreateProposalSchema } from "./schemas";
import type { AssistantToolModule } from "./types";

export const lifeTools: AssistantToolModule = { definitions: [
  { name: "proposeShoppingCreate", group: "shopping_proposal", risk: "proposal", description: "生成待购结构化提案并提示重复候选", module: "shopping" },
  { name: "proposeTravelCreate", group: "travel_proposal", risk: "proposal", description: "生成旅行愿景创建提案", module: "travel" },
], build: (context) => ({
  proposeShoppingCreate: tool({ description: "冻结待购创建提案。创建前会检查标题相似的活跃待购；不要直接写入。", inputSchema: shoppingCreateProposalSchema, execute: async (proposal) => { const { data } = await context.supabase.from("purchase_items").select("id,title,status,price_cny").ilike("title", `%${proposal.title.replaceAll("%", "\\%")}%`).is("archived_at", null).not("status", "in", "(abandoned,archived)").limit(5); return { proposal, possibleDuplicates: data ?? [], actionId: await storeAgentAction({ ...context, domain: "shopping", actionType: "shopping.create", payload: proposal, preview: { ...proposal, possibleDuplicates: data ?? [] }, riskLevel: "medium" }) }; } }),
  proposeTravelCreate: tool({ description: "冻结旅行愿景创建提案；不会直接写入。", inputSchema: travelCreateProposalSchema, execute: async (proposal) => ({ proposal, actionId: await storeAgentAction({ ...context, domain: "travel", actionType: "travel.create", payload: proposal, preview: proposal, riskLevel: "low" }) }) }),
}) };
