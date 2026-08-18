import "server-only";
import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getDeepSeekModel } from "@/lib/ai/deepseek";
import { digest } from "./normalize";
import { diversifyCandidates, rankBriefingCandidates, selectDiverseByQuota } from "./ranking";
import type { AiEvaluation, BriefingInterest, BriefingTopicBucket, FeedCandidate, RankedCandidate } from "./types";

export const BRIEFING_LIMITS = { maxSelected: 8, maxAiCandidates: 24, maxExcerptChars: 600, maxItemsPerSourceBeforeAI: 4, maxAiCallsPerRun: 2 } as const;
export const BRIEFING_AI_PROMPT_VERSION = "briefing-ranking-v2";
export const briefingAiFailureCodes = ["ai_disabled", "ai_budget_exhausted", "briefing_settings_unavailable", "ai_server_configuration_missing", "deepseek_not_configured", "deepseek_credential_unreadable", "ai_provider_request_failed"] as const;
export type BriefingAiFailureCode = typeof briefingAiFailureCodes[number];
const topicBuckets = ["ai_tech", "business_startup", "finance_investing", "economy_society", "wildcard"] as const;
const evaluationSchema = z.object({
  id: z.string(),
  topicBucket: z.enum(topicBuckets),
  informationValue: z.number().min(0).max(100),
  learningValue: z.number().min(0).max(100),
  decisionValue: z.number().min(0).max(100),
  novelty: z.number().min(0).max(100),
  sourceConfidence: z.number().min(0).max(100),
  whyWorthReading: z.string().max(300),
  keyQuestion: z.string().max(300),
  uncertainty: z.string().max(200),
  confidence: z.number().min(0).max(1),
});
const evaluationsSchema = z.object({ evaluations: z.array(evaluationSchema).max(BRIEFING_LIMITS.maxAiCandidates) });
const summariesSchema = z.object({ summaries: z.array(z.object({ id: z.string(), whatHappened: z.string().max(300), whyItMatters: z.string().max(300), keyQuestion: z.string().max(300) })).max(BRIEFING_LIMITS.maxSelected) });
type AiEvaluationValue = z.infer<typeof evaluationSchema>;
export type BriefingAiResult = { selected: Array<RankedCandidate & { ai?: AiEvaluation; summary?: string; whyItMatters?: string; keyQuestion?: string; relevanceReason?: string }>; method: "ai_hybrid" | "deterministic_fallback"; model: string | null; calls: number; inputTokens: number; outputTokens: number; usageReported: boolean; failureCode: BriefingAiFailureCode | null };

export function prefilterBriefingCandidates(candidates: FeedCandidate[], interests: BriefingInterest[], now = new Date(), maxCandidates = BRIEFING_LIMITS.maxAiCandidates) {
  const ranked = rankBriefingCandidates(candidates, interests, now);
  const perSource = new Map<string, number>();
  return ranked.filter((item) => { const count = perSource.get(item.feedId) ?? 0; if (count >= BRIEFING_LIMITS.maxItemsPerSourceBeforeAI) return false; perSource.set(item.feedId, count + 1); return true; }).slice(0, maxCandidates);
}

export function selectDiverseAiCandidates(items: Array<RankedCandidate & { ai?: AiEvaluation }>, limit = BRIEFING_LIMITS.maxSelected) {
  const evaluated = items.filter((item): item is RankedCandidate & { ai: AiEvaluation } => Boolean(item.ai));
  return selectDiverseByQuota(evaluated, limit);
}

const system = `你不是新闻推荐算法。你的任务不是最大化点击率、相关度或用户的即时兴趣。你的任务是帮助用户建立长期有效的 technology sense、product sense、business sense、investment sense 和 world model。

优先选择：
1. 有真实信息增量（不是热门程度）
2. 可以解释机制、因果关系、商业模式、产业变化
3. 能改变或挑战已有判断
4. 有较高一手性或专业性
5. 能帮助用户形成独立观点

避免：
- 重复新闻、PR 稿、纯热点、标题党
- 没有机制解释的宏大叙事
- 同质化 AI 新闻
- 仅因用户过去看过类似内容就无限提高相关度

必须主动保留一定比例的认知探索（wildcard）。信息渠道来自用户人工审核的信源，不得新增来源、不得虚构文章事实；摘要不足时降低 sourceConfidence 与 confidence。所有输出必须是合法 JSON 对象，不得包含 JSON 以外的任何文字。`;
function inputs(items: FeedCandidate[]) { return items.map((item) => ({ id: item.itemId, title: item.title, excerpt: item.excerpt.slice(0, BRIEFING_LIMITS.maxExcerptChars), source: item.feedTitle, source_reason: item.sourceReason?.slice(0, 160) ?? null, category: item.category ?? null, source_priority: item.personalPriority ?? "normal", source_quality: item.sourceQuality ?? "standard", published_at: item.publishedAt })); }
function validById<T extends { id: string }>(items: T[], candidates: FeedCandidate[]) { const ids = new Set(candidates.map((item) => item.itemId)); const seen = new Set<string>(); return items.filter((item) => ids.has(item.id) && !seen.has(item.id) && (seen.add(item.id), true)); }
export function briefingAiFailureCode(error: unknown): BriefingAiFailureCode {
  const message = error instanceof Error ? error.message : "";
  if ((briefingAiFailureCodes as readonly string[]).includes(message)) return message as BriefingAiFailureCode;
  return "ai_provider_request_failed";
}

function judgmentValue(evaluation: Pick<AiEvaluationValue, "informationValue" | "learningValue" | "decisionValue" | "novelty">) {
  return Math.round(0.3 * evaluation.informationValue + 0.3 * evaluation.learningValue + 0.25 * evaluation.decisionValue + 0.15 * evaluation.novelty);
}

function evaluationColumns(value: AiEvaluationValue) {
  return {
    personal_relevance: judgmentValue(value),
    information_value: value.informationValue,
    novelty: value.novelty,
    timeliness: Math.round((value.informationValue + value.decisionValue) / 2),
    confidence: value.confidence,
    reason: value.whyWorthReading.slice(0, 600),
    matched_topics: [] as string[],
    topic_bucket: value.topicBucket,
    learning_value: value.learningValue,
    decision_value: value.decisionValue,
    source_confidence: value.sourceConfidence,
    why_worth_reading: value.whyWorthReading,
    key_question: value.keyQuestion,
    uncertainty: value.uncertainty,
  };
}

function rowToEvaluation(row: Record<string, unknown>): AiEvaluation {
  return {
    id: String(row.feed_item_id),
    topicBucket: row.topic_bucket as BriefingTopicBucket,
    informationValue: Number(row.information_value),
    learningValue: Number(row.learning_value),
    decisionValue: Number(row.decision_value),
    novelty: Number(row.novelty),
    sourceConfidence: Number(row.source_confidence),
    whyWorthReading: String(row.why_worth_reading ?? ""),
    keyQuestion: String(row.key_question ?? ""),
    uncertainty: String(row.uncertainty ?? ""),
    confidence: Number(row.confidence),
  };
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
    const { data: cached } = await supabase.from("briefing_ai_evaluations").select("feed_item_id,content_hash,topic_bucket,information_value,learning_value,decision_value,novelty,source_confidence,confidence,why_worth_reading,key_question,uncertainty").eq("user_id", userId).eq("prompt_version", BRIEFING_AI_PROMPT_VERSION).eq("model", modelId).in("feed_item_id", prefiltered.map((item) => item.itemId));
    const cachedById = new Map((cached ?? []).filter((row) => hashes.get(row.feed_item_id) === row.content_hash).map((row) => [row.feed_item_id, rowToEvaluation(row)]));
    const missing = prefiltered.filter((item) => !cachedById.has(item.itemId));
    if (missing.length) {
      const result = await generateObject({
        model, schema: evaluationsSchema, system,
        prompt: `评估候选资讯，输出 JSON 对象 {"evaluations":[{"id":"<输入的 id>","topicBucket":"...","informationValue":0-100,"learningValue":0-100,"decisionValue":0-100,"novelty":0-100,"sourceConfidence":0-100,"whyWorthReading":"≤300字","keyQuestion":"≤300字","uncertainty":"≤200字","confidence":0-1}]}。

topicBucket 含义：
- ai_tech：AI、Agent、软件、硬件、芯片、机器人、科研、前沿技术
- business_startup：公司战略、商业模式、创业、Founder、VC、产品、竞争、渠道、组织
- finance_investing：股票、PE/VC、资本市场、资产管理、估值、投资框架、资本配置
- economy_society：宏观经济、产业、人口、城市、政策、制度、社会变化
- wildcard：不明显属于用户高频关注方向，但具有较高认知价值、能拓展认知边界的内容（如核电、生物医药、航空航天、日本零售业、能源、历史、农业、物流、新材料、印度等）。必须仍是高质量、有信息增量，不要理解成随机新闻。

informationValue=真实信息增量（如推理成本出现数量级变化、新能力跨过实际产品阈值、商业模式或分发改变、技术瓶颈被解决），不是热门程度。
learningValue=是否帮助建立 business/technology/product/investment sense 或 world model。
decisionValue=是否足以让用户形成或修改一个明确判断。
novelty=是否提供用户过去没有接触过的证据/机制/观点/行业/反方论证（不是发布时间新）。
keyQuestion 必须是真正值得用户自己想的具体问题，围绕 why now / moat / distribution / economics / substitution / market structure / incentives / second-order effects / falsification，不要写"你怎么看这件事"。

id 必须来自下方候选列表。候选：\n${JSON.stringify(inputs(missing))}`,
      });
      calls++; inputTokens += result.usage.inputTokens ?? 0; outputTokens += result.usage.outputTokens ?? 0; usageReported = result.usage.inputTokens !== undefined || result.usage.outputTokens !== undefined;
      const values = validById(result.object.evaluations, missing);
      values.forEach((value) => cachedById.set(value.id, value));
      if (values.length) {
        const { error } = await supabase.from("briefing_ai_evaluations").upsert(values.map((value) => ({ user_id: userId, feed_item_id: value.id, content_hash: hashes.get(value.id)!, preference_version: 1, prompt_version: BRIEFING_AI_PROMPT_VERSION, model: modelId, ...evaluationColumns(value), input_tokens: result.usage.inputTokens ?? null, output_tokens: result.usage.outputTokens ?? null, usage_reported: usageReported })), { onConflict: "user_id,feed_item_id,content_hash,preference_version,prompt_version,model" });
        if (error) throw error;
      }
    }
    const evaluated = prefiltered.map((item) => ({ ...item, ai: cachedById.get(item.itemId) })).filter((item): item is RankedCandidate & { ai: AiEvaluation } => Boolean(item.ai));
    const selected = selectDiverseByQuota(evaluated, maxSelected);
    if (!selected.length) return fallback("ai_provider_request_failed", { model: modelId, calls, inputTokens, outputTokens, usageReported });
    const summary = await generateObject({
      model, schema: summariesSchema, system,
      prompt: `为最终条目写三层认知摘要，只依据 RSS 信息，不得补充事实。输出 JSON 对象 {"summaries":[{"id":"<输入的 id>","whatHappened":"1-2句，只说明文章真正提供的新信息，禁止大段复述","whyItMatters":"1-2句，为什么值得关注、它改变了什么、可能影响哪个行业/公司/技术/投资判断","keyQuestion":"一个具体、值得用户自己想的问题"}]}，id 必须来自下方条目列表。条目：\n${JSON.stringify(inputs(selected))}`,
    });
    calls++; inputTokens += summary.usage.inputTokens ?? 0; outputTokens += summary.usage.outputTokens ?? 0; usageReported ||= summary.usage.inputTokens !== undefined || summary.usage.outputTokens !== undefined;
    const summaries = new Map(validById(summary.object.summaries, selected).map((item) => [item.id, item]));
    return {
      selected: selected.map((item) => {
        const summaryValue = summaries.get(item.itemId);
        const summaryText = summaryValue?.whatHappened || item.excerpt.slice(0, 400);
        return {
          ...item,
          summary: summaryText,
          whyItMatters: summaryValue?.whyItMatters,
          keyQuestion: summaryValue?.keyQuestion,
          relevanceReason: item.ai?.whyWorthReading || item.reason,
        };
      }),
      method: "ai_hybrid", model: modelId, calls, inputTokens, outputTokens, usageReported, failureCode: null,
    };
  } catch (error) { return fallback(briefingAiFailureCode(error), { model: modelId, calls, inputTokens, outputTokens, usageReported }); }
}
