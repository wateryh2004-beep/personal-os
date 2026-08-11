"use server";
import { revalidatePath } from "next/cache";
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
import { assertPublicHttpUrl, safeFetchFeed } from "./safe-fetch";
import type { BriefingGenerationState } from "./types";
import { z } from "zod";

const briefingSettingsSchema = z.object({
  generationMode: z.enum(["scheduled", "on_open", "manual"]),
  aiEnabled: z.coerce.boolean(),
  maxAiCandidates: z.coerce.number().int().min(1).max(48),
  maxSelectedItems: z.coerce.number().int().min(1).max(12),
  dailyInputTokenBudget: z.coerce.number().int().min(1000).max(100000),
  budgetExhaustionBehavior: z.enum(["fallback", "pause"]),
});

export async function createFeedAction(formData:FormData){const value=feedSchema.parse({title:formData.get("title"),feedUrl:formData.get("feed_url"),priority:formData.get("priority"),category:formData.get("category")});const feedUrl=normalizeFeedUrl(value.feedUrl);await assertPublicHttpUrl(feedUrl);const {supabase,userId}=await requireOwner();let validated;try{const response=await safeFetchFeed(feedUrl);if(response.status!==200)throw new Error("invalid_feed");validated=parseFeedXml(response.body);}catch(error){throw new Error(publicFeedError(error));}const {error}=await supabase.from("feeds").insert({user_id:userId,title:value.title||validated.title,feed_url:feedUrl,site_url:validated.siteUrl,description:validated.description,feed_type:validated.type,priority:value.priority,category:value.category});if(error)throw new Error("无法保存订阅，请确认地址没有重复。");revalidatePath("/briefing");}
export async function createPendingFeedAction(formData: FormData) { const value=feedSchema.parse({title:formData.get("title"),feedUrl:formData.get("feed_url"),priority:50,category:formData.get("category")}); const feedUrl=normalizeFeedUrl(value.feedUrl); await assertPublicHttpUrl(feedUrl); const {supabase,userId}=await requireOwner(); let parsed; try { const response=await safeFetchFeed(feedUrl); if(response.status!==200) throw new Error("invalid_feed"); parsed=parseFeedXml(response.body); } catch(error) { throw new Error(publicFeedError(error)); } const {data,error}=await supabase.from("feeds").insert({user_id:userId,title:value.title||parsed.title,feed_url:feedUrl,site_url:parsed.siteUrl,description:parsed.description,feed_type:parsed.type,priority:50,category:value.category,status:"paused",verification_status:"pending",personal_priority:"normal",source_quality:"standard"}).select("id").single(); if(error||!data) throw new Error("无法保存待审核订阅，请确认地址没有重复。"); await refreshFeedForOwner(supabase,userId,data.id,{ignoreCooldown:true}); revalidatePath("/briefing/sources"); }
export async function verifyFeedAction(formData: FormData) { const feedId=String(formData.get("feed_id")||""); const value=sourceGovernanceSchema.parse({category:formData.get("category"),personalPriority:formData.get("personal_priority"),sourceQuality:formData.get("source_quality"),reason:formData.get("reason_for_subscription")}); const {supabase,userId}=await requireOwner(); const {data,error}=await supabase.from("feeds").update({category:value.category,personal_priority:value.personalPriority,source_quality:value.sourceQuality,reason_for_subscription:value.reason,verification_status:"verified",verified_at:new Date().toISOString(),status:"active"}).eq("id",feedId).eq("user_id",userId).select("id").maybeSingle(); if(error||!data) throw new Error("找不到待审核信源。"); revalidatePath("/briefing"); revalidatePath("/briefing/sources"); }
export async function rejectFeedAction(formData: FormData) { const {supabase,userId}=await requireOwner(); const {data,error}=await supabase.from("feeds").update({verification_status:"rejected",status:"archived",archived_at:new Date().toISOString()}).eq("id",String(formData.get("feed_id")||"")).eq("user_id",userId).select("id").maybeSingle(); if(error||!data) throw new Error("找不到待审核信源。"); revalidatePath("/briefing/sources"); }
export async function updateFeedAction(formData: FormData) { const feedId=String(formData.get("feed_id")||""); const value=sourceGovernanceSchema.parse({category:formData.get("category"),personalPriority:formData.get("personal_priority"),sourceQuality:formData.get("source_quality"),reason:formData.get("reason_for_subscription")}); const {supabase,userId}=await requireOwner(); const {data,error}=await supabase.from("feeds").update({category:value.category,personal_priority:value.personalPriority,source_quality:value.sourceQuality,reason_for_subscription:value.reason}).eq("id",feedId).eq("user_id",userId).select("id").maybeSingle(); if(error||!data) throw new Error("找不到信源或无法更新。"); revalidatePath("/briefing/sources"); }
export async function createBriefingInterestAction(formData:FormData){const value=interestSchema.parse({name:formData.get("name"),keywords:formData.get("keywords"),excludedKeywords:formData.get("excluded_keywords"),weight:formData.get("weight")});const {supabase,userId}=await requireOwner();const {error}=await supabase.from("briefing_interests").insert({user_id:userId,name:value.name,keywords:value.keywords,excluded_keywords:value.excludedKeywords,weight:value.weight});if(error)throw new Error("无法保存关注主题。");revalidatePath("/briefing");}
export async function refreshFeedAction(formData:FormData){const {supabase,userId}=await requireOwner();await refreshFeedForOwner(supabase,userId,String(formData.get("feed_id")||""));revalidatePath("/briefing");}
export async function generateBriefingAction(
  previousState: BriefingGenerationState,
): Promise<BriefingGenerationState> {
  void previousState;
  try {
    const { supabase, userId } = await requireOwner();
    const refresh = await refreshBriefingFeedsForOwner(supabase, userId);
    if (refresh.activeFeedCount === 0) {
      return buildBriefingGenerationFeedback(refresh, null);
    }

    const generation = await generateBriefingForOwner(supabase, userId);
    revalidatePath("/briefing");
    revalidatePath("/today");
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
      message: safeMessages.has(message)
        ? message
        : "今日简报暂时无法生成。没有写入不完整结果，请稍后重试。",
    };
  }
}
export async function ensureTodayBriefingAction() {
  const { supabase, userId } = await requireOwner();
  const { data: settings } = await supabase.from("briefing_settings").select("generation_mode").eq("user_id", userId).maybeSingle();
  if (settings?.generation_mode !== "on_open") return { started: false };
  try { await generateBriefingForOwner(supabase, userId, new Date(), "manual"); } catch (error) { if (!(error instanceof Error) || !error.message.includes("正在生成")) throw error; }
  revalidatePath("/briefing"); revalidatePath("/today");
  return { started: true };
}
export async function updateBriefingSettingsAction(formData: FormData) {
  const value = briefingSettingsSchema.parse({ generationMode: formData.get("generation_mode"), aiEnabled: formData.get("ai_enabled") === "on", maxAiCandidates: formData.get("max_ai_candidates"), maxSelectedItems: formData.get("max_selected_items"), dailyInputTokenBudget: formData.get("daily_input_token_budget"), budgetExhaustionBehavior: formData.get("budget_exhaustion_behavior") });
  const { supabase, userId } = await requireOwner();
  const { error } = await supabase.from("briefing_settings").upsert({ user_id: userId, generation_mode: value.generationMode, ai_enabled: value.aiEnabled, max_ai_candidates: value.maxAiCandidates, max_selected_items: value.maxSelectedItems, daily_input_token_budget: value.dailyInputTokenBudget, budget_exhaustion_behavior: value.budgetExhaustionBehavior }, { onConflict: "user_id" });
  if (error) throw new Error("无法保存 Briefing 设置。");
  revalidatePath("/briefing"); revalidatePath("/briefing/interests");
}
export async function setFeedStatusAction(formData:FormData){const feedId=String(formData.get("feed_id")||"");const status=String(formData.get("status")||"");if(!["active","paused","archived"].includes(status))throw new Error("无效订阅状态。");const {supabase}=await requireOwner();const update=status==="archived"?{status,archived_at:new Date().toISOString()}:{status,archived_at:null};const {data,error}=await supabase.from("feeds").update(update).eq("id",feedId).select("id").maybeSingle();if(error||!data)throw new Error("找不到订阅或无法更新。");revalidatePath("/briefing");}
export async function updateBriefingInterestAction(formData: FormData) { const value=interestSchema.parse({name:formData.get("name"),keywords:formData.get("keywords"),excludedKeywords:formData.get("excluded_keywords"),weight:formData.get("weight")}); const {supabase,userId}=await requireOwner(); const {data,error}=await supabase.from("briefing_interests").update({name:value.name,keywords:value.keywords,excluded_keywords:value.excludedKeywords,weight:value.weight}).eq("id",String(formData.get("interest_id")||"")).eq("user_id",userId).select("id").maybeSingle(); if(error||!data) throw new Error("无法更新关注主题。"); revalidatePath("/briefing/interests"); }
export async function setBriefingInterestStatusAction(formData: FormData) { const status=String(formData.get("status")||""); if(!["active","paused","archived"].includes(status)) throw new Error("无效主题状态。"); const {supabase,userId}=await requireOwner(); const update=status==="archived"?{status,archived_at:new Date().toISOString()}:{status,archived_at:null}; const {data,error}=await supabase.from("briefing_interests").update(update).eq("id",String(formData.get("interest_id")||"")).eq("user_id",userId).select("id").maybeSingle(); if(error||!data) throw new Error("无法更新关注主题。"); revalidatePath("/briefing/interests"); }
export async function createBriefingExclusionAction(formData: FormData) { const phrase=String(formData.get("phrase")||"").trim(); if(!phrase||phrase.length>160) throw new Error("过滤词长度应在 1–160 字之间。"); const {supabase,userId}=await requireOwner(); const {error}=await supabase.from("briefing_exclusions").insert({user_id:userId,phrase}); if(error) throw new Error("无法保存全局过滤词。"); revalidatePath("/briefing/interests"); }
export async function archiveBriefingExclusionAction(formData: FormData) { const {supabase,userId}=await requireOwner(); const {error}=await supabase.from("briefing_exclusions").update({archived_at:new Date().toISOString()}).eq("id",String(formData.get("exclusion_id")||"")).eq("user_id",userId); if(error) throw new Error("无法移除全局过滤词。"); revalidatePath("/briefing/interests"); }
