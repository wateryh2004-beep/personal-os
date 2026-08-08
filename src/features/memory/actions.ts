"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  codexMemoryImportSchema,
  decisionSchema,
  memorySchema,
  replaceMemorySchema,
  reverseDecisionSchema,
} from "./schemas";
import { normalizeMemoryKey } from "./types";
import { wallTimeToIso } from "@/features/calendar/timezone";
async function timezoneFor(supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"], userId: string) { const { data } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(); return data?.timezone || "Asia/Shanghai"; }
export async function createPersonalMemoryAction(input: unknown) {
  const value = memorySchema.parse(input);
  const { supabase, userId } = await requireOwner();
  const timezone = await timezoneFor(supabase, userId);
  const key = normalizeMemoryKey(value.memoryType, value.title);
  const { data: exists } = await supabase
    .from("personal_memories")
    .select("id")
    .eq("memory_type", value.memoryType)
    .eq("memory_key", key)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (exists) throw new Error("已有同名当前记忆，请通过更新替换旧记录。");
  const { error } = await supabase.from("personal_memories").insert({
    user_id: userId,
    memory_type: value.memoryType,
    memory_key: key,
    title: value.title,
    content: value.content,
    ai_visibility: value.aiVisibility,
    valid_until: value.validUntil ? wallTimeToIso(value.validUntil, timezone) : null,
    review_at: value.reviewAt ? wallTimeToIso(value.reviewAt, timezone) : null,
    created_via: "manual",
  });
  if (error) throw new Error("无法保存记忆。");
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "memory_create",
    entity_type: "personal_memory",
    actor_type: "user",
    after_data: {
      memory_type: value.memoryType,
      memory_key: key,
      created_via: "manual",
    },
  });
  revalidatePath("/memory");
}

export async function replacePersonalMemoryAction(input: unknown) { const value = replaceMemorySchema.parse(input); const { supabase, userId } = await requireOwner(); const timezone = await timezoneFor(supabase,userId); const { data: owned } = await supabase.from("personal_memories").select("id").eq("id",value.memoryId).maybeSingle(); if(!owned) throw new Error("找不到当前记忆或无权访问。"); const { error }=await supabase.rpc("supersede_personal_memory",{p_memory_id:value.memoryId,p_title:value.title,p_content:value.content,p_ai_visibility:value.aiVisibility,p_valid_until:value.validUntil?wallTimeToIso(value.validUntil,timezone):null,p_review_at:value.reviewAt?wallTimeToIso(value.reviewAt,timezone):null}); if(error) throw new Error("无法替换记忆；原版本仍保持不变。"); await supabase.from("audit_logs").insert({user_id:userId,action:"memory_supersede",entity_type:"personal_memory",entity_id:value.memoryId,actor_type:"user",after_data:{memory_type:value.memoryType}}); revalidatePath("/memory"); }

export async function reverseDecisionAction(input: unknown) { const value=reverseDecisionSchema.parse(input); const {supabase,userId}=await requireOwner(); const timezone=await timezoneFor(supabase,userId); const {data:owned}=await supabase.from("decisions").select("id").eq("id",value.decisionId).maybeSingle(); if(!owned) throw new Error("找不到当前决定或无权访问。"); const {error}=await supabase.rpc("reverse_decision",{p_decision_id:value.decisionId,p_title:value.title,p_decision_text:value.decisionText,p_rationale:value.rationaleMarkdown,p_review_at:value.reviewAt?wallTimeToIso(value.reviewAt,timezone):null}); if(error) throw new Error("无法反转决定；原决定仍保持不变。"); await supabase.from("audit_logs").insert({user_id:userId,action:"decision_reverse",entity_type:"decision",entity_id:value.decisionId,actor_type:"user"}); revalidatePath("/memory"); }
export async function createDecisionAction(input: unknown) {
  const value = decisionSchema.parse(input);
  const { supabase, userId } = await requireOwner();
  const { error } = await supabase.from("decisions").insert({
    user_id: userId,
    title: value.title,
    decision_text: value.decisionText,
    rationale_markdown: value.rationaleMarkdown,
    context_markdown: value.contextMarkdown,
    importance: value.importance,
    ai_visibility: value.aiVisibility,
    decided_at: value.decidedAt ?? new Date().toISOString(),
    review_at: value.reviewAt ?? null,
    created_via: "manual",
  });
  if (error) throw new Error("无法记录决定。");
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "decision_create",
    entity_type: "decision",
    actor_type: "user",
    after_data: { importance: value.importance, created_via: "manual" },
  });
  revalidatePath("/memory");
}

export async function importCodexMemoriesAction(input: unknown) {
  const value = codexMemoryImportSchema.parse(input);
  const { supabase } = await requireOwner();
  const contentHash = createHash("sha256")
    .update(JSON.stringify(value.items))
    .digest("hex");
  const { data, error } = await supabase.rpc("import_personal_memory_batch", {
    p_source_system: "codex",
    p_source_label: value.sourceLabel,
    p_source_exported_at: value.sourceExportedAt ?? new Date().toISOString(),
    p_content_hash: contentHash,
    p_items: value.items,
  });
  if (error) throw new Error("Codex 上下文导入失败，原有 Memory 未被覆盖。");
  const result = (data ?? {}) as Record<string, unknown>;
  revalidatePath("/memory");
  return {
    created: Number(result.created ?? 0),
    superseded: Number(result.superseded ?? 0),
    verified: Number(result.verified ?? 0),
  };
}
