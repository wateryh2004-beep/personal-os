import "server-only";
import { requireOwner } from "@/lib/auth/require-owner";
import { getWorkingMemoryState } from "./types";
export async function getMemoryWorkspace() {
  const { supabase } = await requireOwner();
  const [memories, decisions] = await Promise.all([
    supabase
      .from("personal_memories")
      .select("*")
      .is("archived_at", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("decisions")
      .select("*")
      .is("archived_at", null)
      .order("decided_at", { ascending: false }),
  ]);
  return { memories: memories.data ?? [], decisions: decisions.data ?? [] };
}
export async function getMemoriesForContext(now = new Date()) {
  const { supabase } = await requireOwner();
  const [profile, working, decisions] = await Promise.all([
    supabase
      .from("personal_memories")
      .select(
        "id,memory_type,title,content,ai_visibility,valid_until,review_at,status,archived_at,confirmed_at",
      )
      .eq("memory_type", "profile")
      .eq("status", "active")
      .is("archived_at", null)
      .neq("ai_visibility", "never")
      .limit(30),
    supabase
      .from("personal_memories")
      .select(
        "id,memory_type,title,content,ai_visibility,valid_until,review_at,status,archived_at,confirmed_at",
      )
      .eq("memory_type", "working")
      .eq("status", "active")
      .is("archived_at", null)
      .neq("ai_visibility", "never")
      .limit(30),
    supabase
      .from("decisions")
      .select(
        "id,title,decision_text,rationale_markdown,status,importance,ai_visibility,decided_at,review_at",
      )
      .eq("status", "active")
      .is("archived_at", null)
      .neq("ai_visibility", "never")
      .order("importance", { ascending: false })
      .order("decided_at", { ascending: false })
      .limit(5),
  ]);
  return {
    profile: (profile.data ?? []).filter((x) => x.ai_visibility === "normal"),
    working: (working.data ?? []).filter(
      (x) =>
        x.ai_visibility === "normal" &&
        getWorkingMemoryState(x, now) === "active",
    ),
    decisions: (decisions.data ?? []).filter(
      (x) => x.ai_visibility === "normal",
    ),
  };
}
