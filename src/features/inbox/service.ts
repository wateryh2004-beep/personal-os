import "server-only";

import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const inboxIdSchema = z.string().uuid();

/** Marks a captured thought as dealt with only after its destination succeeded. */
export async function markInboxProcessed(supabase: Supabase, userId: string, inboxId: unknown, target: "task" | "calendar", destinationId: string) {
  const parsed = inboxIdSchema.safeParse(inboxId);
  if (!parsed.success) {
    console.error("[inbox:markInboxProcessed] invalid inbox_id", {
      inboxId: String(inboxId ?? "").slice(0, 64),
      target,
      destinationId,
      userId: userId.slice(0, 8),
    });
    return;
  }
  // converted_task_id 的外键指向核心 tasks 表；「转任务」创建的是
  // microsoft_todo_tasks 记录，写入新列 converted_todo_task_id 以避免
  // 外键违反导致更新静默失败（inbox 卡在收集盒）。
  const values = target === "task"
    ? { processed_at: new Date().toISOString(), converted_todo_task_id: destinationId }
    : { processed_at: new Date().toISOString() };
  const { data, error } = await supabase.from("inbox_items")
    .update(values)
    .eq("id", parsed.data)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[inbox:markInboxProcessed] update failed", {
      inboxId: parsed.data,
      target,
      destinationId,
      userId: userId.slice(0, 8),
      error: error?.message ?? (data ? undefined : "no_row_matched"),
    });
    return;
  }
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "convert",
    entity_type: "inbox_item",
    entity_id: data.id,
    actor_type: "user",
    after_data: { target, destination_id: destinationId },
  });
}
