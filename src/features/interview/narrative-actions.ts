"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwner } from "@/lib/auth/require-owner";

const uuid = z.string().uuid();

function field(data: FormData, name: string) {
  return uuid.parse(String(data.get(name) ?? ""));
}

async function ownerDb() {
  const { userId, supabase } = await requireOwner();
  // Generated database types are updated after applying the reviewed migration.
  return { userId, db: supabase as unknown as SupabaseClient };
}

/** Metadata for an explicit comparison; it does not confirm a prior mutation. */
export async function readNarrativeDraftComparison(input:unknown):Promise<{id:string;selectedVersionId:string}> {
 const id=uuid.parse(input),{db,userId}=await ownerDb();const result=await db.from("interview_narratives").select("id,user_id,archived_at,selected_version_id").eq("id",id).eq("user_id",userId).is("archived_at",null).maybeSingle();
 const row=z.object({id:uuid,user_id:uuid,archived_at:z.null(),selected_version_id:uuid}).strict().safeParse(result.data);
 if(result.error||!row.success||row.data.id!==id||row.data.user_id!==userId)throw new Error("原母版当前不可读，原选择与待核对状态仍保留。");
 return {id:row.data.id,selectedVersionId:row.data.selected_version_id};
}

async function logChange(db: SupabaseClient, userId: string, action: string, id: string, metadata: Record<string, string>) {
  const { error } = await db.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: "interview_narrative",
    entity_id: id,
    actor_type: "user",
    after_data: metadata,
  });
  if (error) throw new Error("修改已写入，但审计日志记录失败；请刷新核对后再操作。");
}

function refreshConsistency() {
  revalidatePath("/career/interview/consistency");
}

/**
 * Changing the baseline does not adopt an answer or rewrite any dependent text.
 * The next read recomputes drift against pinned version IDs.
 */
export async function selectNarrativeBaselineVersion(data: FormData) {
  const narrativeId = field(data, "narrative_id");
  const selectedVersionId = field(data, "selected_version_id");
  const { db, userId } = await ownerDb();
  const { data: narrative, error: narrativeError } = await db.from("interview_narratives")
    .select("id,master_preparation_id,selected_version_id")
    .eq("id", narrativeId).eq("user_id", userId)
    .is("archived_at", null).maybeSingle();
  if (narrativeError || !narrative) throw new Error("母版不存在或无权限操作。");
  const { data: version, error: versionError } = await db.from("interview_answer_versions")
    .select("id,preparation_id,answer_mode")
    .eq("id", selectedVersionId).eq("user_id", userId)
    .is("archived_at", null).maybeSingle();
  if (versionError || !version || version.preparation_id !== narrative.master_preparation_id || version.answer_mode !== "spoken") {
    throw new Error("只能选择当前母题中可用的口述版本。");
  }
  const baseline=data.get("baseline_selected_version_id");if(baseline!==null&&uuid.parse(String(baseline))!==narrative.selected_version_id)throw new Error("母版版本已经变化，原选择已保留，请重新读取后核对。");
  if (narrative.selected_version_id === selectedVersionId) return;
  const { error } = await db.from("interview_narratives")
    .update({ selected_version_id: selectedVersionId, review_status: "draft" })
    .eq("id", narrativeId).eq("user_id", userId)
    .eq("selected_version_id", narrative.selected_version_id).is("archived_at", null)
    .select("id").single();
  if (error) throw new Error("母版可能已由其他操作修改，请刷新后重试。");
  await logChange(db, userId, "select_baseline", narrativeId, {
    previous_version_id: narrative.selected_version_id, selected_version_id: selectedVersionId,
  });
  refreshConsistency();
}

/** Creates an unreviewed reference; this is NOT confirmation of the answer's content. */
export async function registerNarrativeReference(data: FormData) {
  const narrativeId = field(data, "narrative_id");
  const answerVersionId = field(data, "answer_version_id");
  const { db, userId } = await ownerDb();
  const { data: narrative, error: nError } = await db.from("interview_narratives")
    .select("id,master_preparation_id,selected_version_id")
    .eq("id", narrativeId).eq("user_id", userId).is("archived_at", null).single();
  const { data: answer, error: aError } = await db.from("interview_answer_versions")
    .select("id,preparation_id,answer_mode")
    .eq("id", answerVersionId).eq("user_id", userId).is("archived_at", null).single();
  if (nError || aError || !narrative || !answer || answer.answer_mode !== "spoken") {
    throw new Error("找不到母版或答案，无法登记引用。");
  }
  const { data: masterPrep } = await db.from("interview_question_preparations")
    .select("question_id").eq("id", narrative.master_preparation_id)
    .eq("user_id", userId).single();
  const { data: targetPrep } = await db.from("interview_question_preparations")
    .select("question_id,context_id").eq("id", answer.preparation_id)
    .eq("user_id", userId).single();
  if (!masterPrep || !targetPrep?.context_id || masterPrep.question_id !== targetPrep.question_id) {
    throw new Error("该答案不是母题的岗位口述版本，不能建立母版引用。");
  }
  const { data: created, error } = await db.from("interview_answer_narrative_links")
    .insert({
      user_id: userId,
      narrative_id: narrativeId,
      answer_version_id: answerVersionId,
      based_on_version_id: narrative.selected_version_id,
      review_state: "unreviewed",
    }).select("id").single();
  if (error || !created) throw new Error("该答案可能已有母版关联，请刷新后检查。");
  await logChange(db, userId, "register_reference", narrativeId, {
    answer_version_id: answerVersionId, based_on_version_id: narrative.selected_version_id,
  });
  refreshConsistency();
}

/** Human attestation is separate from generating, reading, or linking a draft. */
export async function confirmNarrativeReference(data: FormData) {
  if (String(data.get("review_ack") ?? "") !== "yes") {
    throw new Error("请在对照母版和岗位答案后明确勾选已核对。");
  }
  const linkId = field(data, "link_id");
  const { db, userId } = await ownerDb();
  const { data: link, error } = await db.from("interview_answer_narrative_links")
    .select("id,narrative_id,based_on_version_id,review_state")
    .eq("id", linkId).eq("user_id", userId)
    .is("archived_at", null).single();
  if (error || !link) throw new Error("未找到可核对的母版关联。");
  const { data: narrative } = await db.from("interview_narratives")
    .select("selected_version_id").eq("id", link.narrative_id)
    .eq("user_id", userId).is("archived_at", null).single();
  if (!narrative || narrative.selected_version_id !== link.based_on_version_id) {
    throw new Error("母版版本已变动。请先检查答案内容，不能直接确认旧版本。");
  }
  if (link.review_state === "reviewed") return;
  const updated = await db.from("interview_answer_narrative_links")
    .update({ review_state: "reviewed" }).eq("id", linkId)
    .eq("user_id", userId).eq("review_state", "unreviewed")
    .eq("based_on_version_id", narrative.selected_version_id)
    .select("id").single();
  if (updated.error) throw new Error("关联记录已变动，请刷新后重试。");
  await logChange(db, userId, "review_reference", link.narrative_id, { reference_id: linkId });
  refreshConsistency();
}
