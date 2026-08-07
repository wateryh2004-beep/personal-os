import "server-only";

import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const inboxIdSchema = z.string().uuid();

/** Marks a captured thought as dealt with only after its destination succeeded. */
export async function markInboxProcessed(supabase: Supabase, userId: string, inboxId: unknown, target: "task" | "calendar", destinationId: string) {
  const parsed = inboxIdSchema.safeParse(inboxId);
  if (!parsed.success) return;
  const values = target === "task"
    ? { processed_at: new Date().toISOString(), converted_task_id: destinationId }
    : { processed_at: new Date().toISOString() };
  const { data, error } = await supabase.from("inbox_items")
    .update(values)
    .eq("id", parsed.data)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return;
  await supabase.from("audit_logs").insert({
    user_id: userId,
    action: "convert",
    entity_type: "inbox_item",
    entity_id: data.id,
    actor_type: "user",
    after_data: { target, destination_id: destinationId },
  });
}
