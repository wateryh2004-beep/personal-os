import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "@/lib/env";
import { unsealSecret } from "@/lib/crypto/sealed-secret";
import { createAdminClient } from "@/lib/supabase/admin";

export const deepSeekModelIds = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;
export type DeepSeekModelId = typeof deepSeekModelIds[number];

const keyMaterial = () => {
  if (!env.supabaseSecretKey) throw new Error("ai_server_configuration_missing");
  return `life-of-hang/deepseek-api-key/v1:${env.supabaseSecretKey}`;
};

export function deepSeekKeyMaterial() { return keyMaterial(); }

export async function getDeepSeekModel(userId: string, requestedModel?: DeepSeekModelId) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ai_provider_settings")
    .select("api_key_ciphertext,model,default_event_duration_minutes")
    .eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (error || !data) throw new Error("deepseek_not_configured");
  let apiKey: string;
  try { apiKey = unsealSecret(data.api_key_ciphertext, keyMaterial()); } catch { throw new Error("deepseek_credential_unreadable"); }
  const provider = createOpenAICompatible({ name: "deepseek", apiKey, baseURL: "https://api.deepseek.com" });
  const savedModel = deepSeekModelIds.includes(data.model as DeepSeekModelId) ? data.model as DeepSeekModelId : "deepseek-v4-flash";
  const modelId = requestedModel ?? savedModel;
  return { model: provider(modelId), modelId, defaultEventDurationMinutes: data.default_event_duration_minutes };
}
