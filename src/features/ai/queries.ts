import { requireOwner } from "@/lib/auth/require-owner";
import { noteAiPromptDefinitions } from "@/features/notes/ai-prompts";

export async function getAiSettings() {
  const { supabase, userId } = await requireOwner();
  const [{ data }, { data: profile }] = await Promise.all([
    supabase.from("ai_provider_settings").select("provider,model,default_event_duration_minutes,updated_at").is("archived_at", null).maybeSingle(),
    supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);
  return { settings: data, timezone: profile?.timezone || "Asia/Shanghai" };
}

export async function getNoteAiPromptSettings() {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase
    .from("ai_prompt_overrides")
    .select("prompt_key,content")
    .eq("user_id", userId);
  const overrides = new Map(
    (data ?? []).map((row) => [row.prompt_key, row.content]),
  );
  return {
    available: !error,
    prompts: noteAiPromptDefinitions.map((definition) => ({
      key: definition.key,
      label: definition.label,
      description: definition.description,
      content: overrides.get(definition.key) || definition.defaultContent,
      customized: overrides.has(definition.key),
    })),
  };
}
