"use server";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { decisionSchema, memorySchema } from "./schemas";
import { normalizeMemoryKey } from "./types";
export async function createPersonalMemoryAction(input: unknown) {
  const value = memorySchema.parse(input);
  const { supabase, userId } = await requireOwner();
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
    valid_until: value.validUntil ?? null,
    review_at: value.reviewAt ?? null,
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
