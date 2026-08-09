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
import { feedSchema, interestSchema } from "./schemas";
import { assertPublicHttpUrl, safeFetchFeed } from "./safe-fetch";
import type { BriefingGenerationState } from "./types";

export async function createFeedAction(formData:FormData){const value=feedSchema.parse({title:formData.get("title"),feedUrl:formData.get("feed_url"),priority:formData.get("priority"),category:formData.get("category")});const feedUrl=normalizeFeedUrl(value.feedUrl);await assertPublicHttpUrl(feedUrl);const {supabase,userId}=await requireOwner();let validated;try{const response=await safeFetchFeed(feedUrl);if(response.status!==200)throw new Error("invalid_feed");validated=parseFeedXml(response.body);}catch(error){throw new Error(publicFeedError(error));}const {error}=await supabase.from("feeds").insert({user_id:userId,title:value.title||validated.title,feed_url:feedUrl,site_url:validated.siteUrl,description:validated.description,feed_type:validated.type,priority:value.priority,category:value.category});if(error)throw new Error("无法保存订阅，请确认地址没有重复。");revalidatePath("/briefing");}
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
export async function setFeedStatusAction(formData:FormData){const feedId=String(formData.get("feed_id")||"");const status=String(formData.get("status")||"");if(!["active","paused","archived"].includes(status))throw new Error("无效订阅状态。");const {supabase}=await requireOwner();const update=status==="archived"?{status,archived_at:new Date().toISOString()}:{status,archived_at:null};const {data,error}=await supabase.from("feeds").update(update).eq("id",feedId).select("id").maybeSingle();if(error||!data)throw new Error("找不到订阅或无法更新。");revalidatePath("/briefing");}
