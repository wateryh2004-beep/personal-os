import "server-only";
import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getDeepSeekModel } from "@/lib/ai/deepseek";
import { digest } from "./normalize";
import { diversifyCandidates, rankBriefingCandidates } from "./ranking";
import type { BriefingInterest, FeedCandidate, RankedCandidate } from "./types";

export const BRIEFING_LIMITS = { maxSelected: 8, maxAiCandidates: 24, maxExcerptChars: 600, maxItemsPerSourceBeforeAI: 4, maxAiCallsPerRun: 2 } as const;
export const BRIEFING_AI_PROMPT_VERSION = "briefing-ranking-v1";
export const briefingAiFailureCodes = ["ai_disabled", "ai_budget_exhausted", "briefing_settings_unavailable", "ai_server_configuration_missing", "deepseek_not_configured", "deepseek_credential_unreadable", "ai_provider_request_failed"] as const;
export type BriefingAiFailureCode = typeof briefingAiFailureCodes[number];
const evaluationSchema = z.object({ id: z.string(), personalRelevance: z.number().min(0).max(100), informationValue: z.number().min(0).max(100), novelty: z.number().min(0).max(100), timeliness: z.number().min(0).max(100), confidence: z.number().min(0).max(1), reason: z.string().max(600), matchedTopics: z.array(z.string().max(80)).max(6) });
const evaluationsSchema = z.object({ evaluations: z.array(evaluationSchema).max(BRIEFING_LIMITS.maxAiCandidates) });
const summariesSchema = z.object({ summaries: z.array(z.object({ id: z.string(), summary: z.string().max(700), relevanceReason: z.string().max(600) })).max(BRIEFING_LIMITS.maxSelected) });
export type AiEvaluation = z.infer<typeof evaluationSchema>;
export type BriefingAiResult = { selected: Array<RankedCandidate & { ai?: AiEvaluation; summary?: string; relevanceReason?: string }>; method: "ai_hybrid" | "deterministic_fallback"; model: string | null; calls: number; inputTokens: number; outputTokens: number; usageReported: boolean; failureCode: BriefingAiFailureCode | null };

export function prefilterBriefingCandidates(candidates: FeedCandidate[], interests: BriefingInterest[], now = new Date(), maxCandidates = BRIEFING_LIMITS.maxAiCandidates) {
  const ranked = rankBriefingCandidates(candidates, interests, now);
  const perSource = new Map<string, number>();
  return ranked.filter((item) => { const count = perSource.get(item.feedId) ?? 0; if (count >= BRIEFING_LIMITS.maxItemsPerSourceBeforeAI) return false; perSource.set(item.feedId, count + 1); return true; }).slice(0, maxCandidates);
}

export function selectDiverseAiCandidates(items: Array<RankedCandidate & { ai?: AiEvaluation }>, limit = BRIEFING_LIMITS.maxSelected) {
  const scored = items.map((item) => ({ ...item, score: item.ai ? 0.45 * item.ai.personalRelevance + 0.25 * item.ai.informationValue + 0.15 * item.ai.novelty + 0.15 * item.ai.timeliness + ({ core: 5, important: 3, normal: 1, explore: 0 }[item.personalPriority ?? "normal"] ?? 1) : item.score }));
  const selected: typeof scored = []; const source = new Map<string, number>(); const category = new Map<string, number>();
  for (const item of scored.sort((a, b) => b.score - a.score)) { const sourceCount = source.get(item.feedId) ?? 0; const categoryKey = item.category ?? "未分类"; if (sourceCount >= 2 || (category.get(categoryKey) ?? 0) >= 3) continue; selected.push(item); source.set(item.feedId, sourceCount + 1); category.set(categoryKey, (category.get(categoryKey) ?? 0) + 1); if (selected.length === limit) break; }
  return selected;
}

const system = "你不是新闻编辑器或通用推荐算法。只在用户人工审核的信息源范围内，依据所给 RSS 标题和摘要判断今天的信息价值。不得新增来源、虚构文章事实或仅因热门而加分；摘要不足时降低 confidence。";
function inputs(items: FeedCandidate[]) { return items.map((item) => ({ id: item.itemId, title: item.title, excerpt: item.excerpt.slice(0, BRIEFING_LIMITS.maxExcerptChars), source: item.feedTitle, category: item.category ?? null, source_priority: item.personalPriority ?? "normal", source_quality: item.sourceQuality ?? "standard", published_at: item.publishedAt, matched_interests: [] })); }
function validById<T extends { id: string }>(items: T[], candidates: FeedCandidate[]) { const ids = new Set(candidates.map((item) => item.itemId)); const seen = new Set<string>(); return items.filter((item) => ids.has(item.id) && !seen.has(item.id) && (seen.add(item.id), true)); }
export function briefingAiFailureCode(error: unknown): BriefingAiFailureCode {
  const message = error instanceof Error ? error.message : "";
  if ((briefingAiFailureCodes as readonly string[]).includes(message)) return message as BriefingAiFailureCode;
  return "ai_provider_request_failed";
}

export async function evaluateBriefingWithAi({ supabase, userId, candidates, interests, now = new Date() }: { supabase: SupabaseClient; userId: string; candidates: FeedCandidate[]; interests: BriefingInterest[]; now?: Date }): Promise<BriefingAiResult> {
  const { data: settings, error: settingsError } = await supabase.from("briefing_settings").select("ai_enabled,max_ai_candidates,max_selected_items,daily_input_token_budget,budget_exhaustion_behavior").eq("user_id", userId).maybeSingle();
  const maxCandidates = settings?.max_ai_candidates ?? BRIEFING_LIMITS.maxAiCandidates; const maxSelected = settings?.max_selected_items ?? BRIEFING_LIMITS.maxSelected;
  const fallback = (failureCode: BriefingAiFailureCode | null, usage: Partial<Omit<BriefingAiResult, "selected" | "method" | "failureCode">> = {}) => ({ selected: diversifyCandidates(prefilterBriefingCandidates(candidates, interests, now, maxCandidates), maxSelected), method: "deterministic_fallback" as const, model: usage.model ?? null, calls: usage.calls ?? 0, inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0, usageReported: usage.usageReported ?? false, failureCode });
  if (settingsError) return fallback("briefing_settings_unavailable");
  if (settings?.ai_enabled === false) return fallback("ai_disabled");
  const prefiltered = prefilterBriefingCandidates(candidates, interests, now, maxCandidates); if (!prefiltered.length) return fallback(null);
  const date = now.toISOString().slice(0, 10); const { data: usageRows } = await supabase.from("briefings").select("input_tokens").eq("user_id", userId).eq("briefing_date", date);
  const used = (usageRows ?? []).reduce((total, row) => total + Number(row.input_tokens ?? 0), 0); if (used >= (settings?.daily_input_token_budget ?? 20000)) return fallback("ai_budget_exhausted");
  let calls = 0, inputTokens = 0, outputTokens = 0, usageReported = false, modelId: string | null = null;
  try {
    const configuredModel = await getDeepSeekModel(userId, "deepseek-v4-flash");
    const { model } = configuredModel; modelId = configuredModel.modelId;
    const hashes = new Map(prefiltered.map((item) => [item.itemId, item.contentHash ?? digest(`${item.title}\n${item.excerpt}`)]));
    const { data: cached } = await supabase.from("briefing_ai_evaluations").select("feed_item_id,content_hash,personal_relevance,information_value,novelty,timeliness,confidence,reason,matched_topics").eq("user_id", userId).eq("prompt_version", BRIEFING_AI_PROMPT_VERSION).eq("model", modelId).in("feed_item_id", prefiltered.map((item) => item.itemId));
    const cachedById = new Map((cached ?? []).filter((row) => hashes.get(row.feed_item_id) === row.content_hash).map((row) => [row.feed_item_id, { id: row.feed_item_id, personalRelevance: Number(row.personal_relevance), informationValue: Number(row.information_value), novelty: Number(row.novelty), timeliness: Number(row.timeliness), confidence: Number(row.confidence), reason: row.reason, matchedTopics: row.matched_topics ?? [] }]));
    const missing = prefiltered.filter((item) => !cachedById.has(item.itemId));
    if (missing.length) { const result = await generateObject({ model, schema: evaluationsSchema, system, prompt: `评估候选资讯，仅返回输入 id：\n${JSON.stringify(inputs(missing))}` }); calls++; inputTokens += result.usage.inputTokens ?? 0; outputTokens += result.usage.outputTokens ?? 0; usageReported = result.usage.inputTokens !== undefined || result.usage.outputTokens !== undefined; const values = validById(result.object.evaluations, missing); values.forEach((value) => cachedById.set(value.id, value)); if (values.length) { const { error } = await supabase.from("briefing_ai_evaluations").upsert(values.map((value) => ({ user_id: userId, feed_item_id: value.id, content_hash: hashes.get(value.id)!, preference_version: 1, prompt_version: BRIEFING_AI_PROMPT_VERSION, model: modelId, personal_relevance: value.personalRelevance, information_value: value.informationValue, novelty: value.novelty, timeliness: value.timeliness, confidence: value.confidence, reason: value.reason, matched_topics: value.matchedTopics, input_tokens: result.usage.inputTokens ?? null, output_tokens: result.usage.outputTokens ?? null, usage_reported: usageReported })), { onConflict: "user_id,feed_item_id,content_hash,preference_version,prompt_version,model" }); if (error) throw error; } }
    const evaluated = prefiltered.map((item) => ({ ...item, ai: cachedById.get(item.itemId) })).filter((item): item is RankedCandidate & { ai: AiEvaluation } => Boolean(item.ai)); const selected = selectDiverseAiCandidates(evaluated, maxSelected); if (!selected.length) return fallback("ai_provider_request_failed", { model: modelId, calls, inputTokens, outputTokens, usageReported });
    const summary = await generateObject({ model, schema: summariesSchema, system, prompt: `只依据 RSS 信息，为最终条目写 1–3 句信息增量摘要和简短相关性理由；不得补充事实。\n${JSON.stringify(inputs(selected))}` }); calls++; inputTokens += summary.usage.inputTokens ?? 0; outputTokens += summary.usage.outputTokens ?? 0; usageReported ||= summary.usage.inputTokens !== undefined || summary.usage.outputTokens !== undefined; const summaries = new Map(validById(summary.object.summaries, selected).map((item) => [item.id, item]));
    return { selected: selected.map((item) => ({ ...item, summary: summaries.get(item.itemId)?.summary ?? item.excerpt.slice(0, 400), relevanceReason: summaries.get(item.itemId)?.relevanceReason ?? item.ai?.reason ?? item.reason })), method: "ai_hybrid", model: modelId, calls, inputTokens, outputTokens, usageReported, failureCode: null };
  } catch (error) { return fallback(briefingAiFailureCode(error), { model: modelId, calls, inputTokens, outputTokens, usageReported }); }
}
