import { requireOwner } from "@/lib/auth/require-owner";

export async function getAiSettings() {
  const { supabase, userId } = await requireOwner();
  const [{ data }, { data: profile }] = await Promise.all([
    supabase.from("ai_provider_settings").select("provider,model,default_event_duration_minutes,updated_at").is("archived_at", null).maybeSingle(),
    supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);
  return { settings: data, timezone: profile?.timezone || "Asia/Shanghai" };
}
