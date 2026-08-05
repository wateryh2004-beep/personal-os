import { requireOwner } from "@/lib/auth/require-owner";

export async function getAiSettings() {
  const { supabase } = await requireOwner();
  const { data } = await supabase.from("ai_provider_settings").select("provider,model,updated_at").is("archived_at", null).maybeSingle();
  return data;
}
