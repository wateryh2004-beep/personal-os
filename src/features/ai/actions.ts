"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { sealSecret } from "@/lib/crypto/sealed-secret";
import { deepSeekKeyMaterial } from "@/lib/ai/deepseek";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isNoteAiPromptKey,
  noteAiDefaultPrompt,
} from "@/features/notes/ai-prompts";

const aiSettingsSchema = z.object({
  apiKey: z.string().trim().min(20).max(500).optional(),
  model: z.enum(["deepseek-v4-flash", "deepseek-v4-pro"]),
  defaultEventDurationMinutes: z.coerce.number().int().refine((value) => [15, 30, 45, 60, 90, 120].includes(value)),
});

const promptOverrideSchema = z.object({
  promptKey: z.string().trim().refine(isNoteAiPromptKey),
  content: z.string().trim().min(1).max(12_000),
});

const promptKeySchema = z.string().trim().refine(isNoteAiPromptKey);
const governanceSchema = z.object({
  semanticRetrievalOptIn: z.boolean(), longTermMemoryOptIn: z.boolean(),
  maxContextCharsPerRequest: z.coerce.number().int().min(1000).max(64000),
  maxOutputTokensPerRequest: z.coerce.number().int().min(128).max(8000),
  dailyCallLimit: z.coerce.number().int().min(1).max(10000), monthlyCallLimit: z.coerce.number().int().min(1).max(100000),
  dailyCostLimitUsd: z.coerce.number().min(0).max(1000), monthlyCostLimitUsd: z.coerce.number().min(0).max(10000),
});
const feedbackSchema = z.object({ auditId: z.string().uuid(), feedback: z.enum(["up", "down"]), reason: z.string().trim().max(500).optional(), sourceCorrection: z.string().trim().max(500).optional() });

export async function saveAiGovernance(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = governanceSchema.safeParse({ semanticRetrievalOptIn: formData.get("semantic_retrieval_opt_in") === "on", longTermMemoryOptIn: formData.get("long_term_memory_opt_in") === "on", maxContextCharsPerRequest: formData.get("max_context_chars_per_request"), maxOutputTokensPerRequest: formData.get("max_output_tokens_per_request"), dailyCallLimit: formData.get("daily_call_limit"), monthlyCallLimit: formData.get("monthly_call_limit"), dailyCostLimitUsd: formData.get("daily_cost_limit_usd"), monthlyCostLimitUsd: formData.get("monthly_cost_limit_usd") });
  if (!parsed.success) throw new Error("AI 边界设置无效。");
  const { error } = await supabase.from("ai_governance_settings").upsert({ user_id: userId, semantic_retrieval_opt_in: parsed.data.semanticRetrievalOptIn, long_term_memory_opt_in: parsed.data.longTermMemoryOptIn, max_context_chars_per_request: parsed.data.maxContextCharsPerRequest, max_output_tokens_per_request: parsed.data.maxOutputTokensPerRequest, daily_call_limit: parsed.data.dailyCallLimit, monthly_call_limit: parsed.data.monthlyCallLimit, daily_cost_limit_usd: parsed.data.dailyCostLimitUsd, monthly_cost_limit_usd: parsed.data.monthlyCostLimitUsd }, { onConflict: "user_id" });
  if (error) throw new Error("无法保存 AI 边界设置，请确认最新 migration 已应用。");
  await supabase.from("audit_logs").insert({ user_id: userId, action: "configure", entity_type: "ai_governance", actor_type: "user", after_data: { semantic_retrieval_opt_in: parsed.data.semanticRetrievalOptIn, long_term_memory_opt_in: parsed.data.longTermMemoryOptIn, max_context_chars_per_request: parsed.data.maxContextCharsPerRequest, max_output_tokens_per_request: parsed.data.maxOutputTokensPerRequest, daily_call_limit: parsed.data.dailyCallLimit, monthly_call_limit: parsed.data.monthlyCallLimit } });
  revalidatePath("/settings");
}

export async function submitAiFeedback(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = feedbackSchema.safeParse({ auditId: formData.get("audit_id"), feedback: formData.get("feedback"), reason: formData.get("reason") || undefined, sourceCorrection: formData.get("source_correction") || undefined });
  if (!parsed.success) throw new Error("反馈内容无效。");
  const { data } = await supabase.from("ai_request_audits").select("id").eq("id", parsed.data.auditId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("找不到该 AI 调用记录。");
  const { error } = await createAdminClient().from("ai_request_audits").update({ feedback: parsed.data.feedback, feedback_reason: parsed.data.reason ?? null, source_correction: parsed.data.sourceCorrection ?? null }).eq("id", data.id).eq("user_id", userId);
  if (error) throw new Error("无法保存反馈。");
}

export async function saveDeepSeekKey(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const keyValue = String(formData.get("api_key") || "").trim();
  const parsed = aiSettingsSchema.safeParse({ apiKey: keyValue || undefined, model: formData.get("model"), defaultEventDurationMinutes: formData.get("default_event_duration_minutes") });
  if (!parsed.success) throw new Error("请检查 DeepSeek 设置。");
  const { data: existing } = await supabase.from("ai_provider_settings").select("api_key_ciphertext").eq("user_id", userId).maybeSingle();
  if (!parsed.data.apiKey && !existing?.api_key_ciphertext) throw new Error("请输入有效的 DeepSeek API Key。");
  const { error } = await supabase.from("ai_provider_settings").upsert({
    user_id: userId,
    provider: "deepseek",
    api_key_ciphertext: parsed.data.apiKey ? sealSecret(parsed.data.apiKey, deepSeekKeyMaterial()) : existing!.api_key_ciphertext,
    model: parsed.data.model,
    default_event_duration_minutes: parsed.data.defaultEventDurationMinutes,
    archived_at: null,
  }, { onConflict: "user_id" });
  if (error) throw new Error("无法保存 AI 设置，请稍后重试。");
  await supabase.from("audit_logs").insert({ user_id: userId, action: "configure", entity_type: "ai_provider", after_data: { provider: "deepseek", model: parsed.data.model, default_event_duration_minutes: parsed.data.defaultEventDurationMinutes }, actor_type: "user" });
  revalidatePath("/settings");
}

export async function removeDeepSeekKey() {
  const { supabase, userId } = await requireOwner();
  const { error } = await supabase.from("ai_provider_settings").delete().eq("user_id", userId);
  if (error) throw new Error("无法移除 AI 设置，请稍后重试。");
  await supabase.from("audit_logs").insert({ user_id: userId, action: "remove", entity_type: "ai_provider", after_data: { provider: "deepseek" }, actor_type: "user" });
  revalidatePath("/settings");
}

export async function saveAiPromptOverride(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = promptOverrideSchema.safeParse({
    promptKey: formData.get("prompt_key"),
    content: formData.get("content"),
  });
  if (!parsed.success) throw new Error("提示词内容无效。");

  const defaultContent = noteAiDefaultPrompt(parsed.data.promptKey);
  const query = parsed.data.content === defaultContent
    ? supabase
        .from("ai_prompt_overrides")
        .delete()
        .eq("user_id", userId)
        .eq("prompt_key", parsed.data.promptKey)
    : supabase.from("ai_prompt_overrides").upsert({
        user_id: userId,
        prompt_key: parsed.data.promptKey,
        content: parsed.data.content,
      }, { onConflict: "user_id,prompt_key" });
  const { error } = await query;
  if (error) throw new Error("无法保存提示词，请确认最新 migration 已应用。");
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: parsed.data.content === defaultContent ? "reset" : "configure",
    entity_type: "ai_prompt",
    after_data: {
      prompt_key: parsed.data.promptKey,
      customized: parsed.data.content !== defaultContent,
      character_count: parsed.data.content.length,
    },
    actor_type: "user",
  });
  revalidatePath("/settings");
}

export async function resetAiPromptOverride(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = promptKeySchema.safeParse(formData.get("prompt_key"));
  if (!parsed.success) throw new Error("提示词标识无效。");
  const { error } = await supabase
    .from("ai_prompt_overrides")
    .delete()
    .eq("user_id", userId)
    .eq("prompt_key", parsed.data);
  if (error) throw new Error("无法恢复默认提示词，请稍后重试。");
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "reset",
    entity_type: "ai_prompt",
    after_data: { prompt_key: parsed.data, customized: false },
    actor_type: "user",
  });
  revalidatePath("/settings");
}
