"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getReviewPeriod } from "./periods";

const createSchema = z.object({
  type: z.enum(["daily", "weekly"]),
  content: z.string().trim().min(1).max(10000),
});
const decisionReviewSchema=z.object({decisionId:z.string().uuid(),content:z.string().trim().min(1).max(10000),outcome:z.enum(["keep","reverse"]),newTitle:z.string().trim().max(200).optional(),newDecisionText:z.string().trim().max(5000).optional(),rationale:z.string().max(20000).optional()}).superRefine((value,ctx)=>{if(value.outcome==="reverse"&&(!value.newTitle||!value.newDecisionText))ctx.addIssue({code:"custom",message:"反转决定时必须记录新的决定。"});});

async function ownerTimezone() {
  const owner = await requireOwner();
  const { data: profile } = await owner.supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", owner.userId)
    .maybeSingle();
  return { ...owner, timezone: profile?.timezone || "Asia/Shanghai" };
}

export async function createReview(input: unknown) {
  const value = createSchema.parse(input);
  const { supabase, userId, timezone } = await ownerTimezone();
  const period = getReviewPeriod(value.type, new Date(), timezone);
  const title = value.type === "daily" ? `每日复盘 · ${period.startDate}` : `每周复盘 · ${period.startDate} — ${period.endDate}`;
  const { count } = await supabase.from("reviews").select("id", { count: "exact", head: true }).eq("review_key", period.key);
  const { data: reviewId, error } = await supabase.rpc("complete_review", { p_review_type: value.type, p_review_key: period.key, p_title: title, p_period_start: period.startDate, p_period_end: period.endDate, p_content_markdown: value.content, p_structured_data: { freeReflection: value.content } });
  if (error || !reviewId) throw new Error("无法原子保存复盘与版本快照，请稍后再试。");
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: count ? "review_amend" : "review_complete",
    entity_type: "review",
    entity_id: reviewId,
    actor_type: "user",
    after_data: { review_type: value.type, period: period.key, source_count: 0 },
  });
  revalidatePath("/reviews");
}
export async function completeDecisionReview(input:unknown){const value=decisionReviewSchema.parse(input);const {supabase,userId,timezone}=await ownerTimezone();const {data:decision}=await supabase.from("decisions").select("id,title").eq("id",value.decisionId).eq("status","active").is("archived_at",null).maybeSingle();if(!decision)throw new Error("找不到待复核决定或无权访问。");const period=getReviewPeriod("daily",new Date(),timezone);const key=`decision:${decision.id}:${period.startDate}`;const {data:reviewId,error}=await supabase.rpc("complete_decision_review",{p_decision_id:decision.id,p_review_key:key,p_title:`决定复核 · ${decision.title}`,p_review_date:period.startDate,p_content:value.content,p_outcome:value.outcome,p_new_title:value.newTitle||null,p_new_decision_text:value.newDecisionText||null,p_rationale:value.rationale||""});if(error||!reviewId)throw new Error("决定复核未能原子保存，决定仍保持原状。");await supabase.from("audit_logs").insert({user_id:userId,action:"decision_review_complete",entity_type:"review",entity_id:reviewId,actor_type:"user",after_data:{decision_id:decision.id,outcome:value.outcome}});revalidatePath("/reviews");revalidatePath("/memory");}
