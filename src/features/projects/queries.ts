import { requireOwner } from "@/lib/auth/require-owner";

export async function getProjects() {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase.from("projects").select("id,name,description,status,due_date,updated_at").eq("user_id", userId).is("archived_at", null).order("updated_at", { ascending: false });
  if (error) return { projects: [], unavailable: true };
  return { projects: data ?? [], unavailable: false };
}
