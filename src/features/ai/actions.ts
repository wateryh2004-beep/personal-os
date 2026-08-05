"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { sealSecret } from "@/lib/crypto/sealed-secret";
import { deepSeekKeyMaterial } from "@/lib/ai/deepseek";

const apiKeySchema = z.string().trim().min(20).max(500);

export async function saveDeepSeekKey(formData: FormData) {
  const { supabase, userId } = await requireOwner();
  const parsed = apiKeySchema.safeParse(formData.get("api_key"));
  if (!parsed.success) throw new Error("请输入有效的 DeepSeek API Key。");
  const { error } = await supabase.from("ai_provider_settings").upsert({
    user_id: userId,
    provider: "deepseek",
    api_key_ciphertext: sealSecret(parsed.data, deepSeekKeyMaterial()),
    model: "deepseek-v4-flash",
    archived_at: null,
  }, { onConflict: "user_id" });
  if (error) throw new Error("无法保存 AI 设置，请稍后重试。");
  await supabase.from("audit_logs").insert({ user_id: userId, action: "configure", entity_type: "ai_provider", after_data: { provider: "deepseek", model: "deepseek-v4-flash" }, actor_type: "user" });
  revalidatePath("/settings");
}

export async function removeDeepSeekKey() {
  const { supabase, userId } = await requireOwner();
  const { error } = await supabase.from("ai_provider_settings").delete().eq("user_id", userId);
  if (error) throw new Error("无法移除 AI 设置，请稍后重试。");
  await supabase.from("audit_logs").insert({ user_id: userId, action: "remove", entity_type: "ai_provider", after_data: { provider: "deepseek" }, actor_type: "user" });
  revalidatePath("/settings");
}
