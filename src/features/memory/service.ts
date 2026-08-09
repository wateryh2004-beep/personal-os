import "server-only";

import type { z } from "zod";
import { wallTimeToIso } from "@/features/calendar/timezone";
import type { requireOwner } from "@/lib/auth/require-owner";
import type {
  decisionSchema,
  memorySchema,
  replaceMemorySchema,
  reverseDecisionSchema,
} from "./schemas";
import { normalizeMemoryKey } from "./types";

type OwnerClient = Awaited<ReturnType<typeof requireOwner>>["supabase"];

async function timezoneFor(supabase: OwnerClient, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.timezone || "Asia/Shanghai";
}

export async function createPersonalMemory(input: {
  supabase: OwnerClient;
  userId: string;
  value: z.infer<typeof memorySchema>;
}) {
  const timezone = await timezoneFor(input.supabase, input.userId);
  const key = normalizeMemoryKey(input.value.memoryType, input.value.title);
  const { data: exists } = await input.supabase
    .from("personal_memories")
    .select("id")
    .eq("memory_type", input.value.memoryType)
    .eq("memory_key", key)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (exists) throw new Error("已有同名当前记忆，请通过更新替换旧记录。");
  const { data, error } = await input.supabase
    .from("personal_memories")
    .insert({
      user_id: input.userId,
      memory_type: input.value.memoryType,
      memory_key: key,
      title: input.value.title,
      content: input.value.content,
      ai_visibility: input.value.aiVisibility,
      valid_until: input.value.validUntil
        ? wallTimeToIso(input.value.validUntil, timezone)
        : null,
      review_at: input.value.reviewAt
        ? wallTimeToIso(input.value.reviewAt, timezone)
        : null,
      created_via: "manual",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("无法保存记忆。");
  await input.supabase.from("audit_logs").insert({
    user_id: input.userId,
    action: "memory_create",
    entity_type: "personal_memory",
    entity_id: data.id,
    actor_type: "user",
    after_data: {
      memory_type: input.value.memoryType,
      memory_key: key,
      created_via: "manual",
    },
  });
  return data.id;
}

export async function replacePersonalMemory(input: {
  supabase: OwnerClient;
  userId: string;
  value: z.infer<typeof replaceMemorySchema>;
}) {
  const timezone = await timezoneFor(input.supabase, input.userId);
  const { data: owned } = await input.supabase
    .from("personal_memories")
    .select("id")
    .eq("id", input.value.memoryId)
    .maybeSingle();
  if (!owned) throw new Error("找不到当前记忆或无权访问。");
  const { error } = await input.supabase.rpc("supersede_personal_memory", {
    p_memory_id: input.value.memoryId,
    p_title: input.value.title,
    p_content: input.value.content,
    p_ai_visibility: input.value.aiVisibility,
    p_valid_until: input.value.validUntil
      ? wallTimeToIso(input.value.validUntil, timezone)
      : null,
    p_review_at: input.value.reviewAt
      ? wallTimeToIso(input.value.reviewAt, timezone)
      : null,
  });
  if (error) throw new Error("无法替换记忆；原版本仍保持不变。");
  await input.supabase.from("audit_logs").insert({
    user_id: input.userId,
    action: "memory_supersede",
    entity_type: "personal_memory",
    entity_id: input.value.memoryId,
    actor_type: "user",
    after_data: { memory_type: input.value.memoryType },
  });
}

export async function reverseDecision(input: {
  supabase: OwnerClient;
  userId: string;
  value: z.infer<typeof reverseDecisionSchema>;
}) {
  const timezone = await timezoneFor(input.supabase, input.userId);
  const { data: owned } = await input.supabase
    .from("decisions")
    .select("id")
    .eq("id", input.value.decisionId)
    .maybeSingle();
  if (!owned) throw new Error("找不到当前决定或无权访问。");
  const { error } = await input.supabase.rpc("reverse_decision", {
    p_decision_id: input.value.decisionId,
    p_title: input.value.title,
    p_decision_text: input.value.decisionText,
    p_rationale: input.value.rationaleMarkdown,
    p_review_at: input.value.reviewAt
      ? wallTimeToIso(input.value.reviewAt, timezone)
      : null,
  });
  if (error) throw new Error("无法反转决定；原决定仍保持不变。");
  await input.supabase.from("audit_logs").insert({
    user_id: input.userId,
    action: "decision_reverse",
    entity_type: "decision",
    entity_id: input.value.decisionId,
    actor_type: "user",
  });
}

export async function createDecision(input: {
  supabase: OwnerClient;
  userId: string;
  value: z.infer<typeof decisionSchema>;
}) {
  const { data, error } = await input.supabase
    .from("decisions")
    .insert({
      user_id: input.userId,
      title: input.value.title,
      decision_text: input.value.decisionText,
      rationale_markdown: input.value.rationaleMarkdown,
      context_markdown: input.value.contextMarkdown,
      importance: input.value.importance,
      ai_visibility: input.value.aiVisibility,
      decided_at: input.value.decidedAt ?? new Date().toISOString(),
      review_at: input.value.reviewAt ?? null,
      created_via: "manual",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("无法记录决定。");
  await input.supabase.from("audit_logs").insert({
    user_id: input.userId,
    action: "decision_create",
    entity_type: "decision",
    entity_id: data.id,
    actor_type: "user",
    after_data: { importance: input.value.importance, created_via: "manual" },
  });
  return data.id;
}
