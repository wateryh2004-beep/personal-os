"use server";
import { getDateKeyInTimeZone } from "@/features/today/utils";
import { revalidatePath } from "@/lib/workspace-revalidation";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  buildBriefingGenerationFeedback,
  initialBriefingGenerationState,
} from "./feedback";
import { normalizeFeedUrl } from "./normalize";
import { parseFeedXml } from "./parser";
import {
  generateBriefingForOwner,
  publicFeedError,
  refreshBriefingFeedsForOwner,
  refreshFeedForOwner,
} from "./orchestrator";
import { feedSchema, interestSchema, sourceGovernanceSchema } from "./schemas";
import { briefingJudgmentIntentSchema, type BriefingJudgmentIntent, type BriefingJudgmentOutcome } from "./judgment-intents";
import { assertPublicHttpUrl, safeFetchFeed } from "./safe-fetch";
import type { BriefingGenerationState } from "./types";
import { z } from "zod";
import { briefingFormIntentSchema, type BriefingFormIntent, type BriefingFormOutcome } from "./form-intents";

const briefingSettingsSchema = z.object({
  generationMode: z.enum(["scheduled", "on_open", "manual"]),
  aiEnabled: z.coerce.boolean(),
  maxAiCandidates: z.coerce.number().int().min(1).max(48),
  maxSelectedItems: z.coerce.number().int().min(1).max(12),
  dailyInputTokenBudget: z.coerce.number().int().min(1000).max(100000),
  budgetExhaustionBehavior: z.enum(["fallback", "pause"]),
});

export async function createFeedAction(formData:FormData){const value=feedSchema.parse({title:formData.get("title"),feedUrl:formData.get("feed_url"),priority:formData.get("priority"),category:formData.get("category")});const feedUrl=normalizeFeedUrl(value.feedUrl);await assertPublicHttpUrl(feedUrl);const {supabase,userId}=await requireOwner();let validated;try{const response=await safeFetchFeed(feedUrl);if(response.status!==200)throw new Error("invalid_feed");validated=parseFeedXml(response.body);}catch(error){throw new Error(publicFeedError(error));}const {error}=await supabase.from("feeds").insert({user_id:userId,title:value.title||validated.title,feed_url:feedUrl,site_url:validated.siteUrl,description:validated.description,feed_type:validated.type,priority:value.priority,category:value.category});if(error)throw new Error("无法保存订阅，请确认地址没有重复。");await revalidatePath("/briefing");}
export async function createPendingFeedAction(formData: FormData) { const value=feedSchema.parse({title:formData.get("title"),feedUrl:formData.get("feed_url"),priority:50,category:formData.get("category")}); const feedUrl=normalizeFeedUrl(value.feedUrl); await assertPublicHttpUrl(feedUrl); const {supabase,userId}=await requireOwner(); let parsed; try { const response=await safeFetchFeed(feedUrl); if(response.status!==200) throw new Error("invalid_feed"); parsed=parseFeedXml(response.body); } catch(error) { throw new Error(publicFeedError(error)); } const {data,error}=await supabase.from("feeds").insert({user_id:userId,title:value.title||parsed.title,feed_url:feedUrl,site_url:parsed.siteUrl,description:parsed.description,feed_type:parsed.type,priority:50,category:value.category,status:"paused",verification_status:"pending",personal_priority:"normal",source_quality:"standard"}).select("id").single(); if(error||!data) throw new Error("无法保存待审核订阅，请确认地址没有重复。"); await refreshFeedForOwner(supabase,userId,data.id,{ignoreCooldown:true}); await revalidatePath("/briefing/sources"); }
export async function verifyFeedAction(formData: FormData) { const feedId=String(formData.get("feed_id")||""); const value=sourceGovernanceSchema.parse({category:formData.get("category"),personalPriority:formData.get("personal_priority"),sourceQuality:formData.get("source_quality"),reason:formData.get("reason_for_subscription")}); const {supabase,userId}=await requireOwner(); const {data,error}=await supabase.from("feeds").update({category:value.category,personal_priority:value.personalPriority,source_quality:value.sourceQuality,reason_for_subscription:value.reason,verification_status:"verified",verified_at:new Date().toISOString(),status:"active"}).eq("id",feedId).eq("user_id",userId).select("id").maybeSingle(); if(error||!data) throw new Error("找不到待审核信源。"); await revalidatePath("/briefing"); await revalidatePath("/briefing/sources"); }
export async function rejectFeedAction(formData: FormData) { const {supabase,userId}=await requireOwner(); const {data,error}=await supabase.from("feeds").update({verification_status:"rejected",status:"archived",archived_at:new Date().toISOString()}).eq("id",String(formData.get("feed_id")||"")).eq("user_id",userId).select("id").maybeSingle(); if(error||!data) throw new Error("找不到待审核信源。"); await revalidatePath("/briefing/sources"); }
export async function updateFeedAction(formData: FormData) { const feedId=String(formData.get("feed_id")||""); const value=sourceGovernanceSchema.parse({category:formData.get("category"),personalPriority:formData.get("personal_priority"),sourceQuality:formData.get("source_quality"),reason:formData.get("reason_for_subscription")}); const {supabase,userId}=await requireOwner(); const {data,error}=await supabase.from("feeds").update({category:value.category,personal_priority:value.personalPriority,source_quality:value.sourceQuality,reason_for_subscription:value.reason}).eq("id",feedId).eq("user_id",userId).select("id").maybeSingle(); if(error||!data) throw new Error("找不到信源或无法更新。"); await revalidatePath("/briefing/sources"); }
export async function createBriefingInterestAction(formData:FormData){const value=interestSchema.parse({name:formData.get("name"),keywords:formData.get("keywords"),excludedKeywords:formData.get("excluded_keywords"),weight:formData.get("weight")});const {supabase,userId}=await requireOwner();const {error}=await supabase.from("briefing_interests").insert({user_id:userId,name:value.name,keywords:value.keywords,excluded_keywords:value.excludedKeywords,weight:value.weight});if(error)throw new Error("无法保存关注主题。");await revalidatePath("/briefing");}
export async function refreshFeedAction(formData:FormData){const {supabase,userId}=await requireOwner();await refreshFeedForOwner(supabase,userId,String(formData.get("feed_id")||""));await revalidatePath("/briefing");}
export async function generateBriefingAction(
  previousState: BriefingGenerationState,
  expectedDate?: string,
): Promise<BriefingGenerationState> {
  void previousState;
  try {
    const { supabase, userId } = await requireOwner();
    const now = new Date();
    if (expectedDate && !await matchesBriefingDate(supabase, userId, now, expectedDate)) return { ...initialBriefingGenerationState, status: "error", message: "日期或时区已变化，尚未开始生成，请重新读取今日简报。" };
    const refresh = await refreshBriefingFeedsForOwner(supabase, userId);
    if (refresh.activeFeedCount === 0) {
      return buildBriefingGenerationFeedback(refresh, null);
    }

    const generation = await generateBriefingForOwner(supabase, userId, now, "manual", expectedDate);
    await revalidatePath("/briefing");
    await revalidatePath("/today");
    return buildBriefingGenerationFeedback(refresh, generation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safeMessages = new Set([
      "无法读取订阅源。",
      "无法读取候选资讯。",
      "无法建立今日 Briefing。",
      "无法更新今日 Briefing。",
      "无法保存今日 Briefing。",
      "无法完成今日 Briefing。",
      "今日 Briefing 正在生成，请稍后刷新。",
    ]);
    return {
      ...initialBriefingGenerationState,
      status: "error",
      needsCheck: true,
      message: safeMessages.has(message)
        ? message
        : "今日简报结果尚未核对，请先核对本日简报，避免重复生成。",
    };
  }
}
async function matchesBriefingDate(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], userId: string, now: Date, expectedDate: string) {
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(expectedDate);
  const { data, error } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("日期尚未读取，未开始生成。");
  return getDateKeyInTimeZone(now, data?.timezone || "Asia/Shanghai") === expectedDate;
}
export async function ensureTodayBriefingAction(expectedDate?: string) {
  const { supabase, userId } = await requireOwner();
  const now = new Date();
  if (expectedDate && !await matchesBriefingDate(supabase, userId, now, expectedDate)) return { started: false, reason: "date-changed" as const };
  const { data: settings } = await supabase.from("briefing_settings").select("generation_mode").eq("user_id", userId).maybeSingle();
  if (settings?.generation_mode !== "on_open") return { started: false };
  try { await generateBriefingForOwner(supabase, userId, now, "manual", expectedDate); } catch (error) { if (!(error instanceof Error) || !error.message.includes("正在生成")) throw error; }
  await revalidatePath("/briefing"); await revalidatePath("/today");
  return { started: true };
}
/** Status-only read after a lost response; never refreshes feeds or invokes AI. */
export async function readBriefingGenerationAction(dateInput: unknown) {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dateInput);
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("briefings").select("id,status,selected_count,candidate_count,ranking_method,updated_at").eq("user_id", userId).eq("briefing_date", date).order("updated_at", { ascending: false }).order("id").limit(1).maybeSingle();
  if (error) throw new Error("简报状态尚未读取。");
  return data;
}
export async function updateBriefingSettingsAction(formData: FormData) {
  const value = briefingSettingsSchema.parse({ generationMode: formData.get("generation_mode"), aiEnabled: formData.get("ai_enabled") === "on", maxAiCandidates: formData.get("max_ai_candidates"), maxSelectedItems: formData.get("max_selected_items"), dailyInputTokenBudget: formData.get("daily_input_token_budget"), budgetExhaustionBehavior: formData.get("budget_exhaustion_behavior") });
  const { supabase, userId } = await requireOwner();
  const { error } = await supabase.from("briefing_settings").upsert({ user_id: userId, generation_mode: value.generationMode, ai_enabled: value.aiEnabled, max_ai_candidates: value.maxAiCandidates, max_selected_items: value.maxSelectedItems, daily_input_token_budget: value.dailyInputTokenBudget, budget_exhaustion_behavior: value.budgetExhaustionBehavior }, { onConflict: "user_id" });
  if (error) throw new Error("无法保存 Briefing 设置。");
  await revalidatePath("/briefing"); await revalidatePath("/briefing/interests");
}
export async function setFeedStatusAction(formData:FormData){const feedId=String(formData.get("feed_id")||"");const status=String(formData.get("status")||"");if(!["active","paused","archived"].includes(status))throw new Error("无效订阅状态。");const {supabase}=await requireOwner();const update=status==="archived"?{status,archived_at:new Date().toISOString()}:{status,archived_at:null};const {data,error}=await supabase.from("feeds").update(update).eq("id",feedId).select("id").maybeSingle();if(error||!data)throw new Error("找不到订阅或无法更新。");await revalidatePath("/briefing");}
export async function updateBriefingInterestAction(formData: FormData) { const value=interestSchema.parse({name:formData.get("name"),keywords:formData.get("keywords"),excludedKeywords:formData.get("excluded_keywords"),weight:formData.get("weight")}); const {supabase,userId}=await requireOwner(); const {data,error}=await supabase.from("briefing_interests").update({name:value.name,keywords:value.keywords,excluded_keywords:value.excludedKeywords,weight:value.weight}).eq("id",String(formData.get("interest_id")||"")).eq("user_id",userId).select("id").maybeSingle(); if(error||!data) throw new Error("无法更新关注主题。"); await revalidatePath("/briefing/interests"); }
export async function setBriefingInterestStatusAction(formData: FormData) { const status=String(formData.get("status")||""); if(!["active","paused","archived"].includes(status)) throw new Error("无效主题状态。"); const {supabase,userId}=await requireOwner(); const update=status==="archived"?{status,archived_at:new Date().toISOString()}:{status,archived_at:null}; const {data,error}=await supabase.from("briefing_interests").update(update).eq("id",String(formData.get("interest_id")||"")).eq("user_id",userId).select("id").maybeSingle(); if(error||!data) throw new Error("无法更新关注主题。"); await revalidatePath("/briefing/interests"); }
export async function createBriefingExclusionAction(formData: FormData) { const phrase=String(formData.get("phrase")||"").trim(); if(!phrase||phrase.length>160) throw new Error("过滤词长度应在 1–160 字之间。"); const {supabase,userId}=await requireOwner(); const {error}=await supabase.from("briefing_exclusions").insert({user_id:userId,phrase}); if(error) throw new Error("无法保存全局过滤词。"); await revalidatePath("/briefing/interests"); }
export async function archiveBriefingExclusionAction(formData: FormData) { const {supabase,userId}=await requireOwner(); const {error}=await supabase.from("briefing_exclusions").update({archived_at:new Date().toISOString()}).eq("id",String(formData.get("exclusion_id")||"")).eq("user_id",userId); if(error) throw new Error("无法移除全局过滤词。"); await revalidatePath("/briefing/interests"); }

function judgmentRpcInput(value: z.infer<typeof briefingJudgmentIntentSchema>) {
  return { p_intent_id: value.intentId, p_entry_id: value.entryId, p_expected_decision_id: value.expectedDecisionId,
    p_expected_updated_at: value.expectedUpdatedAt, p_judgment: value.judgment, p_confidence: value.confidence,
    p_falsification: value.falsification, p_review_period: value.reviewPeriod };
}
const judgmentCanonicalSchema = z.object({ decision_id: z.string().uuid(), updated_at: z.string().datetime({ offset: true }), superseded: z.boolean() });
export async function reconcileBriefingJudgmentIntentAction(input: BriefingJudgmentIntent): Promise<BriefingJudgmentOutcome> {
  const value = briefingJudgmentIntentSchema.safeParse(input);
  if (!value.success) return { status: "rejected", code: "invalid", message: "请核对判断内容与原版本，当前输入保留。" };
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("read_briefing_judgment_intent", judgmentRpcInput(value.data));
  if (error?.code === "40001") return { status: "rejected", code: "conflict", message: "这次提交内容或原版本不一致，请保留输入核对。" };
  const result = judgmentCanonicalSchema.safeParse(data);
  if (error || !result.success) return { status: "needs-check", message: "保存结果尚未核对，原输入与提交标识已保留，不会重复创建判断。" };
  return { status: "saved", entryId: value.data.entryId, decisionId: result.data.decision_id, updatedAt: result.data.updated_at, superseded: result.data.superseded };
}
export async function saveBriefingJudgmentIntentAction(input: BriefingJudgmentIntent): Promise<BriefingJudgmentOutcome> {
  const value = briefingJudgmentIntentSchema.safeParse(input);
  if (!value.success) return { status: "rejected", code: "invalid", message: "请填写有效判断、置信度和原版本，当前输入保留。" };
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("save_briefing_judgment_intent", judgmentRpcInput(value.data));
  if (error?.code === "40001") return { status: "rejected", code: "conflict", message: "判断已有新版本，请保留当前输入，重新读取并比较。" };
  const result = judgmentCanonicalSchema.safeParse(data);
  if (error || !result.success) return reconcileBriefingJudgmentIntentAction(input);
  await revalidatePath("/briefing"); await revalidatePath("/briefing/history");
  return { status: "saved", entryId: value.data.entryId, decisionId: result.data.decision_id, updatedAt: result.data.updated_at, superseded: result.data.superseded };
}
/** Legacy action retains its void form contract; only canonical success returns. */
export async function saveBriefingJudgmentAction(formData: FormData): Promise<void> {
  const result = await saveBriefingJudgmentIntentAction({ intentId: String(formData.get("intent_id") || crypto.randomUUID()), entryId: String(formData.get("entry_id") || ""),
    expectedDecisionId: String(formData.get("expected_decision_id") || "") || null, expectedUpdatedAt: String(formData.get("expected_updated_at") || "") || null,
    judgment: String(formData.get("judgment") || ""), confidence: String(formData.get("confidence") || ""), falsification: String(formData.get("falsification") || ""),
    reviewPeriod: z.enum(["1_month", "3_months", "6_months", "1_year"]).parse(formData.get("review_period")) });
  if (result.status !== "saved") throw new Error(result.message);
}

/** Finite ordinary-form protocol. These are original domain rows, not a second receipt store. */
function parseBriefingForm(input: BriefingFormIntent) {
  const value = briefingFormIntentSchema.parse(input);
  switch (value.kind) {
    case "feed-create": {
      const feed = feedSchema.parse({ title: value.title, feedUrl: value.feed_url, category: value.category, priority: 50 });
      return { value, table: "feeds" as const, id: value.intentId, expected: null, fields: { title: feed.title, feed_url: normalizeFeedUrl(feed.feedUrl), category: feed.category } };
    }
    case "feed-edit": case "feed-verify": {
      if (!value.expectedUpdatedAt) throw new Error("missing_baseline");
      const feed = sourceGovernanceSchema.parse({ category: value.category, personalPriority: value.personal_priority, sourceQuality: value.source_quality, reason: value.reason_for_subscription });
      return { value, table: "feeds" as const, id: value.feed_id, expected: value.expectedUpdatedAt, fields: { category: feed.category, personal_priority: feed.personalPriority, source_quality: feed.sourceQuality, reason_for_subscription: feed.reason, ...(value.kind === "feed-verify" ? { verification_status: "verified", status: "active" } : {}) } };
    }
    case "interest-create": case "interest-edit": {
      if (value.kind === "interest-edit" && !value.expectedUpdatedAt) throw new Error("missing_baseline");
      const interest = interestSchema.parse({ name: value.name, weight: value.weight, keywords: value.keywords, excludedKeywords: value.excluded_keywords });
      return { value, table: "briefing_interests" as const, id: value.kind === "interest-edit" ? value.interest_id : value.intentId, expected: value.kind === "interest-edit" ? value.expectedUpdatedAt : null, fields: { name: interest.name, weight: interest.weight, keywords: interest.keywords, excluded_keywords: interest.excludedKeywords } };
    }
    case "exclusion-create": return { value, table: "briefing_exclusions" as const, id: value.intentId, expected: null, fields: { phrase: z.string().trim().min(1).max(160).parse(value.phrase) } };
    case "settings": {
      const settings = briefingSettingsSchema.parse({ generationMode: value.generation_mode, aiEnabled: value.ai_enabled, dailyInputTokenBudget: value.daily_input_token_budget, maxAiCandidates: value.max_ai_candidates, maxSelectedItems: value.max_selected_items, budgetExhaustionBehavior: value.budget_exhaustion_behavior });
      return { value, table: "briefing_settings" as const, id: null, expected: value.expectedUpdatedAt, fields: { generation_mode: settings.generationMode, ai_enabled: settings.aiEnabled, daily_input_token_budget: settings.dailyInputTokenBudget, max_ai_candidates: settings.maxAiCandidates, max_selected_items: settings.maxSelectedItems, budget_exhaustion_behavior: settings.budgetExhaustionBehavior } };
    }
  }
}
async function readBriefingForm(parsed: ReturnType<typeof parseBriefingForm>): Promise<BriefingFormOutcome> {
  const { supabase, userId } = await requireOwner();
  const columns = ["updated_at", ...Object.keys(parsed.fields)].join(",");
  let query = supabase.from(parsed.table).select(columns).eq("user_id", userId);
  query = parsed.id ? query.eq("id", parsed.id) : query;
  const { data, error } = await query.maybeSingle();
  if (error || !data) return { status: "needs-check", message: "保存结果尚未核对，输入和提交标识已保留。" };
  const row = data as unknown as Record<string, unknown>;
  const matches = Object.entries(parsed.fields).every(([key, value]) => JSON.stringify(row[key]) === JSON.stringify(value));
  if (matches && typeof row.updated_at === "string") return { status: "saved", id: parsed.id ?? userId, updatedAt: row.updated_at, message: "已保存。" };
  return { status: "rejected", code: "conflict", message: "当前记录与本次内容不一致，输入已保留，请重新读取并比较。" };
}
export async function reconcileBriefingFormIntentAction(input: BriefingFormIntent): Promise<BriefingFormOutcome> {
  let parsed;
  try { parsed = parseBriefingForm(input); } catch { return { status: "rejected", code: "invalid", message: "请核对表单内容和原版本，当前输入保留。" }; }
  return readBriefingForm(parsed);
}
export async function submitBriefingFormIntentAction(input: BriefingFormIntent): Promise<BriefingFormOutcome> {
  let parsed;
  try { parsed = parseBriefingForm(input); } catch { return { status: "rejected", code: "invalid", message: "请核对表单内容和原版本，当前输入保留。" }; }
  const { supabase, userId } = await requireOwner();
  // Pure preflight prevents replay from repeating feed fetching or overwriting a newer version.
  let preflight = supabase.from(parsed.table).select("updated_at").eq("user_id", userId);
  if (parsed.id) preflight = preflight.eq("id", parsed.id);
  const prior = await preflight.maybeSingle();
  if (prior.error) return { status: "rejected", code: "unavailable", message: "暂时无法读取原版本，尚未提交，输入保留。" };
  try {
    if (parsed.value.kind === "feed-create") {
      const existing = await supabase.from("feeds").select("id").eq("user_id", userId).eq("id", parsed.id!).maybeSingle();
      if (existing.error) return { status: "rejected", code: "unavailable", message: "暂时无法核对订阅，尚未提交。" };
      if (existing.data) return readBriefingForm(parsed);
      const url = normalizeFeedUrl(parsed.value.feed_url);
      await assertPublicHttpUrl(url);
      let feed;
      try { const response = await safeFetchFeed(url); if (response.status !== 200) throw new Error("invalid_feed"); feed = parseFeedXml(response.body); }
      catch (error) { return { status: "rejected", code: "invalid", message: publicFeedError(error) }; }
      const { error } = await supabase.from("feeds").insert({ id: parsed.id!, user_id: userId, title: parsed.value.title.trim(), feed_url: url, category: parsed.value.category.trim() || null, site_url: feed.siteUrl, description: feed.description, feed_type: feed.type, priority: 50, status: "paused", verification_status: "pending", personal_priority: "normal", source_quality: "standard" });
      if (!error) { try { await refreshFeedForOwner(supabase, userId, parsed.id!, { ignoreCooldown: true }); } catch { /* Saving the subscription is independent of a subsequent feed refresh. */ } }
    } else if (parsed.value.kind === "interest-create") {
      const fields = interestSchema.parse({ name: parsed.value.name, weight: parsed.value.weight, keywords: parsed.value.keywords, excludedKeywords: parsed.value.excluded_keywords });
      await supabase.from("briefing_interests").insert({ id: parsed.id!, user_id: userId, name: fields.name, weight: fields.weight, keywords: fields.keywords, excluded_keywords: fields.excludedKeywords });
    } else if (parsed.value.kind === "exclusion-create") {
      await supabase.from("briefing_exclusions").insert({ id: parsed.id!, user_id: userId, phrase: parsed.value.phrase.trim() });
    } else if (parsed.value.kind === "settings" && parsed.expected === null) {
      await supabase.from("briefing_settings").insert({ user_id: userId, ...parsed.fields });
    } else {
      let query = supabase.from(parsed.table).update({ ...parsed.fields, ...(parsed.value.kind === "feed-verify" ? { verified_at: new Date().toISOString() } : {}) }).eq("user_id", userId).eq("updated_at", parsed.expected!);
      if (parsed.id) query = query.eq("id", parsed.id);
      await query;
    }
  } catch { return readBriefingForm(parsed); }
  const result = await readBriefingForm(parsed);
  if (result.status === "saved") { await revalidatePath("/briefing"); await revalidatePath("/briefing/sources"); await revalidatePath("/briefing/interests"); }
  return result;
}
