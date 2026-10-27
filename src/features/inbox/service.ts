import "server-only";

import { diagnosticErrorKind } from "@/lib/diagnostics";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const inboxIdSchema = z.string().uuid();

/** A failed source commit is not a successful conversion; retries repair only this mark. */
export async function markInboxProcessed(supabase: Supabase, userId: string, inboxId: unknown, target: "task" | "calendar", destinationId: string): Promise<boolean> {
  if (inboxId === undefined || inboxId === null || inboxId === "") return true;
  const parsed = inboxIdSchema.safeParse(inboxId);
  if (!parsed.success) return false;
  const { data, error } = await supabase.rpc("finish_inbox_target", { p_inbox_id: parsed.data, p_target: target, p_destination_id: destinationId });
  if (error) console.error("[inbox:markInboxProcessed] failed", { reason: diagnosticErrorKind(error), target });
  return !error && data === true;
}
