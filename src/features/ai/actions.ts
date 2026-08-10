"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { sealSecret } from "@/lib/crypto/sealed-secret";
import { deepSeekKeyMaterial } from "@/lib/ai/deepseek";
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
